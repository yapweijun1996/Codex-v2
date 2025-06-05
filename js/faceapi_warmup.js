/**
 * faceapi_warmup.js
 * ------------------
 * Helper utilities that sit on top of face-api.js + a Service Worker.
 * The script is responsible for:
 *   • Boot-strapping the Service Worker that loads the neural-network models in a
 *     separate thread (avoids blocking the main UI).
 *   • Handling camera start / stop, reading frames and forwarding them to the
 *     worker for inference.
 *   • Drawing helper overlays: raw frame, bounding box, facial landmarks, etc.
 *   • Performing basic registration / verification logic using Euclidean
 *     distance between face descriptors.
 *
 * NOTE: For brevity the implementation uses a bunch of global variables. If you
 * intend to maintain / extend the code consider wrapping it inside an IIFE or
 * converting it to an ES Module to avoid polluting the global scope.
 */
var videoId = "video";
/**
 * ID of the hidden canvas used for capturing raw video frames for inference.
 * @type {string}
 */
var canvasId = "canvas";
var canvasId2 = "canvas2";
var canvasId3 = "canvas3";
/**
 * ID of the snapshot canvas used to display the detected face image with confidence percentage.
 * @type {string}
 */
var canvasOutputId = "canvas_output";
var step_fps = 125 ; // 1000 / 125 = 8 FPS
var vle_face_landmark_position_yn = "y" ; // y / n
var vle_facebox_yn = "y" ; // y / n


var isWorkerReady = false;
var worker = "";
var serviceWorkerFileName = "faceDetectionServiceWorker.js";
var serviceWorkerFilePath = "./js/faceDetectionServiceWorker.js";
var imgFaceFilePathForWarmup = "./models/face_for_loading.png";

if(typeof face_detector_options_setup === "undefined" || face_detector_options_setup === "undefined"){
	var face_detector_options_setup = {
		inputSize: 128,
		scoreThreshold: 0.1,
		maxDetectedFaces: 1,
	};
}

var isDetectingFrame = false;          // Prevent overlapping detection requests
var videoDetectionStep = null;         // Reference to the next frame callback

// Add user registration support
var currentUserId = '';
var currentUserName = '';
var currentUserDescriptors = [];
var registeredUsers = [];
var flatRegisteredDescriptors = [];
var flatRegisteredUserMeta = [];
// Flag to allow multiple face detection ("y" = allow multiple, else single)
var multiple_face_detection_yn = "y";

// Similarity filtering settings for registration
var registrationSimilarityThreshold = 0.10; // minimum Euclidean distance to accept new capture
var maxRegistrationAttempts = 20;            // maximum attempts per descriptor slot
var currentRegistrationAttempt = 0;          // attempt counter for current slot
var bestCandidateDescriptor = null;          // best diverse descriptor seen so far
var bestCandidateMinDist = 0;                // its distance

// Add helper functions for improved registration checks and feedback
const duplicateThreshold = 0.3; // threshold for duplicate across users; local-only
const consistencyThreshold = 0.6; // max allowed distance from previous captures

function showMessage(type, message) {
    const msgEl = document.getElementById('registrationMessage');
    if (!msgEl) return;
    msgEl.innerText = message;
    switch (type) {
        case 'error':
            msgEl.style.color = 'red';
            break;
        case 'success':
            msgEl.style.color = 'green';
            break;
        default:
            msgEl.style.color = 'blue';
    }
}

function updateRegistrationProgress() {
    const progressEl = document.getElementById('registrationProgress');
    if (!progressEl) return;
    progressEl.max = maxCaptures;
    progressEl.value = currentUserDescriptors.length;
    progressEl.style.display = 'block';
}

function isConsistentWithCurrentUser(descriptor) {
    if (currentUserDescriptors.length === 0) return true;
    return currentUserDescriptors.every(refDesc =>
        faceapi.euclideanDistance(descriptor, refDesc) < consistencyThreshold
    );
}

function isDuplicateAcrossUsers(descriptor) {
    // Implement backend check if needed; local-only returns false
    return false;
}

// Check if descriptor matches current user's existing captures
function isRecognizedAsCurrentUser(descriptor) {
    return currentUserDescriptors.some(refDesc =>
        faceapi.euclideanDistance(descriptor, refDesc) < consistencyThreshold
    );
}

// Draw bounding box and label for registration/recognition overlay
function drawRegistrationOverlay(detection) {
    const video = document.getElementById(videoId);
    const canvas = document.getElementById(canvasId3);
    const ctx = canvas.getContext('2d');
    canvas.style.display = 'block';
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const box = detection.alignedRect._box;
    const MX = canvas.width - box._x - box._width;
    const MY = box._y;
    const recognized = isRecognizedAsCurrentUser(detection.descriptor);
    const color = recognized ? 'green' : 'red';
    // Draw bounding box
    ctx.beginPath(); ctx.rect(MX, MY, box._width, box._height);
    ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke();
    // Draw label text above box
    ctx.font = '18px Arial'; ctx.fillStyle = color;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    const labelText = recognized ? `${currentUserName} (${currentUserId})` : 'Unknown';
    ctx.fillText(labelText, MX, MY - 10);
}

async function camera_start() {
	var video = document.getElementById(videoId);
        try {
                var stream = await navigator.mediaDevices.getUserMedia({ video: true });
                video.srcObject = stream;
        } catch (error) {
                console.error('Error accessing webcam:', error);
                showMessage('error', 'Unable to access camera: ' + error.message);
                alert('Unable to access camera. Please check permissions. ' + error.name + ': ' + error.message);
        }
}

async function camera_stop() {
	var video = document.getElementById(videoId);
	if (video.srcObject) {
		const stream = video.srcObject;
		const tracks = stream.getTracks();
		tracks.forEach(track => track.stop());
		video.srcObject = null;
	}
}

async function handleJsonFileInput(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    let allUsers = [];
    let errorFiles = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const text = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsText(file);
            });
            const data = JSON.parse(text);
            if (Array.isArray(data) && data.length > 0 && data[0].hasOwnProperty('id')) {
                allUsers = allUsers.concat(data);
            } else {
                // Old format: array of descriptors (not recommended for multi-user)
                // Wrap as a dummy user
                allUsers.push({ id: null, name: null, descriptors: data });
            }
        } catch (err) {
            errorFiles.push(file.name);
        }
    }
    if (errorFiles.length > 0) {
        showMessage('error', 'Failed to load: ' + errorFiles.join(', '));
    }
    if (allUsers.length > 0) {
        await load_face_descriptor_json(JSON.stringify(allUsers), true);
        showMessage('success', `Loaded ${allUsers.length} users from ${files.length} file(s).`);
    }
}

async function load_face_descriptor_json(warmupFaceDescriptorJson, merge = false) {
    try {
        const data = JSON.parse(warmupFaceDescriptorJson);
        if (Array.isArray(data) && data.length > 0 && data[0].hasOwnProperty('id')) {
            if (!merge) {
                registeredUsers = data;
            } else {
                registeredUsers = (registeredUsers || []).concat(data);
            }
            flatRegisteredDescriptors = [];
            flatRegisteredUserMeta = [];
            registeredUsers.forEach(user => {
                user.descriptors.forEach(descArr => {
                    flatRegisteredDescriptors.push(new Float32Array(descArr));
                    flatRegisteredUserMeta.push({ id: user.id, name: user.name });
                });
            });
            registeredDescriptors = flatRegisteredDescriptors;
        } else {
            // Old format: array of descriptors
            const descriptors = Object.values(data).map(descriptor => {
                if (Array.isArray(descriptor) || typeof descriptor === 'object' && descriptor !== null) {
                    return new Float32Array(Object.values(descriptor));
                } else {
                    return null;
                }
            }).filter(descriptor => descriptor !== null);
            registeredDescriptors = descriptors;
            flatRegisteredDescriptors = descriptors;
            flatRegisteredUserMeta = descriptors.map(() => ({ id: null, name: null }));
        }
        camera_start();
        video_face_detection();
    } catch (error) {
        showMessage('error', 'Error loading face descriptors: ' + error.message);
    }
}

/**
 * Continuously captures video frames and sends them to the service worker for face detection.
 * Draws the raw frame into the hidden canvas (canvasId) for inference.
 */
function video_face_detection() {
	var video = document.getElementById(videoId);
	var canvas = document.getElementById(canvasId);
	canvas.willReadFrequently = true; 
	var context = canvas.getContext("2d");
	context.willReadFrequently = true; 
	
	video.addEventListener('play', () => {
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		function step() {
			// Skip processing if video is paused/ended or a detection is already running
			if (video.paused || video.ended) {
				return;
			}
			if (isDetectingFrame) {
				// Wait until the previous detection result returns
				requestAnimationFrame(step);
				return;
			}

			// Capture current frame
			context.drawImage(video, 0, 0, canvas.width, canvas.height);
			const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

			// Mark a detection in-flight and send the frame to the worker
			isDetectingFrame = true;
			worker.postMessage({
				type: 'DETECT_FACES',
				imageData,
				width: canvas.width,
				height: canvas.height,
				face_detector_options: face_detector_options_setup,
			});

			// Schedule the next frame – this will be skipped if detection is still running
			// Next frame will be scheduled when the worker returns the detection result
		}

		// Store reference so we can trigger a new cycle from the worker callback
		videoDetectionStep = step;
		requestAnimationFrame(step);
	});
}
			
async function unregisterAllServiceWorker() {
	navigator.serviceWorker.getRegistrations().then(registrations => {
		registrations.forEach(registration => {
			registration.unregister();
		});
	});
}

/**
 * Draws the captured face image and confidence percentage onto the snapshot canvas (canvasOutputId).
 * @param {Array} detections - Array containing face detection results and raw ImageData.
 * @param {string} canvasId - ID of the canvas to draw the snapshot on.
 */
async function drawImageDataToCanvas(detections, canvasId) {
    var canvas = document.getElementById(canvasId);
    var context = canvas.getContext("2d");

    // Check if detections have faces
    if (Array.isArray(detections) && detections.length > 0) {
        const imageData = detections[1][0]; // Assuming imageData is part of detections
		var confidence = 0;
		
		if (detections.length > 0 && detections[0].length > 0) {
			if(detections[0][0].detection._score !== "undefined"){
				confidence = detections[0][0].detection._score;
			}
			if(confidence != 0){
				confidence = confidence * 100;
			}
		}
		console.log(confidence);

        // Set canvas dimensions to match the imageData
        canvas.width = imageData.width;
        canvas.height = imageData.height;

        // Draw the first ImageData onto the canvas at position (0, 0)
        context.putImageData(imageData, 0, 0);
		
		// Display confidence percentage
        context.font = '20px Arial';
        context.fillStyle = 'white'; // Color for text
        context.fillText(`Confidence: ${confidence.toFixed(2)}%`, 10, 30); // Fixed to 2 decimal places

    } else {
        console.log('No image data to draw');
    }
}

/* Overlay Canvas Elements:
 *   #canvas        – hidden canvas capturing raw video frames for worker inference.
 *   #canvas2       – overlay for drawing facial landmarks (mirrored to match video).
 *   #canvas3       – overlay for drawing bounding boxes and confidence (mirrored to match video).
 *   #canvas_output – snapshot canvas showing captured face image with confidence.
 *
 * Canvas Functions:
 *   video_face_detection    – continuously grabs video frames and sends to service worker for detection.
 *   drawImageDataToCanvas   – displays the detected-face snapshot and confidence on #canvas_output.
 *   drawLandmarks           – draws mirrored landmark points on #canvas2 overlay.
 *   draw_face_box           – draws mirrored face bounding box and upright confidence text on #canvas3 overlay.
 *   draw_face_landmarks     – draws detailed mirrored landmark shapes on #canvas2 overlay.
 */

/**
 * Draws mirrored facial landmark dots onto the landmarks overlay canvas (canvasId2).
 * @param {Array<{ x: number, y: number }>} landmarks - Array of landmark point coordinates.
 */
function drawLandmarks(landmarks) {
    // Legacy stub: forward to full spline glow style
    draw_face_landmarks();
}

/**
 * Draws a mirrored face bounding box and confidence percentage onto the bounding box overlay canvas (canvasId3).
 * @param {string} canvas_id - ID of the canvas to draw the bounding box.
 * @param {Object} box - Bounding box object with _x, _y, _width, and _height properties.
 * @param {number} confidence - Confidence score (0 to 1) of the face detection.
 */
function draw_face_box(canvas_id, box, confidence) {
    const canvas = document.getElementById(canvas_id);
    const ctx = canvas.getContext('2d');
    const video = document.getElementById(videoId);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.style.display = 'block';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const mx = canvas.width - box._x - box._width;
    const my = box._y;
    let boxColor = 'red';
    if (confidence >= 0.8) boxColor = 'green'; else if (confidence >= 0.5) boxColor = 'yellow';
    ctx.beginPath(); ctx.rect(mx, my, box._width, box._height);
    ctx.lineWidth = 3; ctx.strokeStyle = boxColor; ctx.stroke();
    ctx.font = '16px Arial'; ctx.fillStyle = boxColor;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${Math.round(confidence * 100)}%`, mx + box._width - 5, my - 10);
}

/**
 * Draws detailed facial landmarks with optional connecting lines onto the landmarks overlay canvas (canvasId2).
 */
function draw_face_landmarks(detection) {
    if (!detection || !detection.landmarks || !detection.landmarks._positions) return;
    const video = document.getElementById(videoId);
    const canvas = document.getElementById(canvasId2);
    const ctx = canvas.getContext('2d');
    canvas.style.display = 'block';
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const width = canvas.width;
    const height = canvas.height;
    // Extract and mirror landmark positions
    const raw = detection.landmarks._positions;
    const pts = raw.map(pt => ({ x: width - pt._x, y: pt._y }));
    ctx.clearRect(0, 0, width, height);
    // Draw each landmark as a small white circle with corporate-blue outline
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#007ACC';
    ctx.lineWidth = 1;
    pts.forEach(({ x, y }) => {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    });
    // Define facial feature groups by landmark indices
    const groups = {
        jaw: [...Array(17).keys()],
        leftBrow: [17,18,19,20,21],
        rightBrow: [22,23,24,25,26],
        noseBridge: [27,28,29,30],
        noseBottom: [31,32,33,34,35],
        leftEye: [36,37,38,39,40,41,36],
        rightEye: [42,43,44,45,46,47,42],
        outerLips: [48,49,50,51,52,53,54,55,56,57,58,59,48],
        innerLips: [60,61,62,63,64,65,66,67,60]
    };
    // Draw subtle gray lines for each group
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 1;
    for (const idxs of Object.values(groups)) {
        ctx.beginPath();
        idxs.forEach((i, k) => {
            const p = pts[i];
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
    }
}

var registeredDescriptors = [];
var maxCaptures = 20;
var registrationCompleted = false;
var verificationCompleted = false;
var registrationStartTime = null;
var registrationTimeout = 1 * 60 * 1000; // 1 minute

function faceapi_register(descriptor) {
    if (!descriptor || registrationCompleted) {
        return;
    }
    // On first capture, read user info
    if (currentUserDescriptors.length === 0) {
        currentUserId = document.getElementById('userIdInput').value.trim();
        currentUserName = document.getElementById('userNameInput').value.trim();
    }
    let accept = false;
    // Always accept the first descriptor
    if (currentUserDescriptors.length === 0) {
        accept = true;
    } else {
        // Compute minimum distance to existing descriptors
        const distances = currentUserDescriptors.map(d => faceapi.euclideanDistance(descriptor, d));
        const minDist = Math.min(...distances);
        // Update best candidate if more distinct
        currentRegistrationAttempt++;
        if (minDist > bestCandidateMinDist) {
            bestCandidateMinDist = minDist;
            bestCandidateDescriptor = descriptor;
        }
        // Accept if sufficiently different
        if (minDist > registrationSimilarityThreshold) {
            accept = true;
        } else if (currentRegistrationAttempt >= maxRegistrationAttempts) {
            // Max attempts reached, accept best candidate so far
            accept = true;
            descriptor = bestCandidateDescriptor || descriptor;
        }
    }
    if (accept) {
        currentUserDescriptors.push(descriptor);
        updateRegistrationProgress();
        // Reset attempt tracking
        currentRegistrationAttempt = 0;
        bestCandidateDescriptor = null;
        bestCandidateMinDist = 0;
        // Check if registration is complete
        if (currentUserDescriptors.length >= maxCaptures) {
            alert("Registration completed for user: " + currentUserName + " (" + currentUserId + ")");
            showMessage('success', `Registration completed for ${currentUserName} (${currentUserId}).`);
            registrationCompleted = true;
            faceapi_action = null;
            camera_stop();
            const progressEl = document.getElementById('registrationProgress');
            if (progressEl) progressEl.style.display = 'none';
            // Build one entry per captured descriptor
            const downloadData = currentUserDescriptors.map(desc => ({
                id: currentUserId,
                name: currentUserName,
                descriptors: [ Array.from(desc) ]
            }));
            // Trigger download of per-capture JSON
            const jsonData = JSON.stringify(downloadData, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = 'faceid_with_users.json';
            downloadLink.click();
            URL.revokeObjectURL(url);
            // Flatten descriptors for verification
            flatRegisteredDescriptors = [];
            flatRegisteredUserMeta = [];
            downloadData.forEach(userObj => {
                userObj.descriptors.forEach(descArr => {
                    flatRegisteredDescriptors.push(new Float32Array(descArr));
                    flatRegisteredUserMeta.push({ id: userObj.id, name: userObj.name });
                });
            });
            registeredDescriptors = flatRegisteredDescriptors;
            // Reset for next registration if needed
            currentUserDescriptors = [];
        }
    }
}

var vle_distance_rate = 0.3;

/**
 * Threshold used by face-api.js Euclidean distance to decide whether two
 * face descriptors correspond to the same person.
 *
 * A lower value makes the verification stricter (fewer false positives but
 * more false negatives). 0.3 is a commonly used starting point that works
 * well in good lighting conditions. Adjust empirically for your setup.
 */
function faceapi_verify(descriptor){
    if (descriptor && !verificationCompleted) {
        let matchFound = false;
        let distance;
        let matchedIndex = -1;
        
        for (let i = 0; i < registeredDescriptors.length; i++) {
            if (descriptor.length === registeredDescriptors[i].length) {
                distance = faceapi.euclideanDistance(descriptor, registeredDescriptors[i]);
                if (distance < vle_distance_rate) {
                    matchFound = true;
                    matchedIndex = i;
                    break;
                }
            }
        }
        
        if (matchFound) {
            const userMeta = flatRegisteredUserMeta[matchedIndex] || { name: 'Unknown', id: 'Unknown' };
            if (multiple_face_detection_yn !== "y") {
                camera_stop();
                verificationCompleted = true;
                faceapi_action = null;
                alert(`Face Verified: ${userMeta.name} (${userMeta.id}), distance: ${distance.toFixed(3)}`);
            } else {
                console.log(`Face Detected: ${userMeta.name} (${userMeta.id}), distance: ${distance.toFixed(3)}`);
            }
        } else {
            // No match found
        }
    }
}

async function initWorkerAddEventListener() {
	navigator.serviceWorker.addEventListener('message', (event) => {
		console.log('event.data.type.');
		console.log(event.data.type);
		switch (event.data.type) {
			case 'MODELS_LOADED':
			console.log('Face detection models loaded.');
			faceapi_warmup();
			break;
			case 'DETECTION_RESULT':
			console.log("DETECTION_RESULT here");
			console.log(event);
			console.log(event.data.data.detections[0]);
			console.log("event.data.data.detections");
			console.log(event.data.data.detections);
			
			
			const dets = event.data.data.detections[0];
			if (Array.isArray(dets) && dets.length > 0) {
				if (faceapi_action === "verify") {
					if (multiple_face_detection_yn === "y") {
						drawAllFaces(dets);
					} else {
						faceapi_verify(dets[0].descriptor);
					}
				} else if (faceapi_action === "register") {
                                        // Handle registration timeout
                                        if (registrationStartTime === null) {
                                                registrationStartTime = Date.now();
                                                showMessage('info', 'Registration started.');
                                                updateRegistrationProgress();
                                        }
					if (Date.now() - registrationStartTime > registrationTimeout) {
						showMessage('error', 'Registration timed out. Please try again.');
						faceapi_action = null;
						camera_stop();
						registrationCompleted = true;
					} else if (dets.length !== 1) {
						showMessage('error', 'Please ensure only one face is visible for registration.');
					} else {
                                                const descriptor = dets[0].descriptor;
                                                if (!isConsistentWithCurrentUser(descriptor)) {
                                                        showMessage('error', 'Face too different from previous captures.');
                                                } else {
                                                        showMessage('success', 'Face capture accepted.');
                                                        faceapi_register(descriptor);
                                                }
					}
				} else {
					console.log("faceapi_action is NULL");
				}
			}
			
			if (typeof vle_face_landmark_position_yn === "string" && vle_face_landmark_position_yn == "y") {
				if (Array.isArray(dets) && dets.length > 0 && dets[0]) {
					draw_face_landmarks(dets[0]);
				}
			}
			
			if (multiple_face_detection_yn !== "y" && typeof vle_facebox_yn === "string" && vle_facebox_yn == "y") {
				var temp_canvas_id = canvasId3;
				var temp_canvas = document.getElementById(temp_canvas_id);
				if (dets && dets.length > 0) {
					// facebox
					console.log("draw_face_box");
					if (dets[0] && dets[0] !== undefined) {
						var box = dets[0].alignedRect._box;
						var confidence = dets[0].detection._score;

						// Check if box is defined and not null
						if (box && box._x !== undefined && box._y !== undefined && box._width !== undefined && box._height !== undefined) {
							// Safe to call the function as box is valid
							draw_face_box(temp_canvas_id, box, confidence);
						} else {
							console.log("Box is not defined or invalid");
						}
					}
				}else{
					temp_canvas.style.display = "none";
				}
			}
			
			// During registration, overlay recognition info
			if (faceapi_action === "register") {
				if (Array.isArray(dets) && dets.length > 0 && dets[0]) {
					drawRegistrationOverlay(dets[0]);
				}
			}
			
			// After all drawing operations are complete, mark detection as done and queue the next frame.
			isDetectingFrame = false;
			if (typeof videoDetectionStep === 'function') {
				requestAnimationFrame(videoDetectionStep);
			}
			
			break;
			case 'WARMUP_RESULT':
			console.log('WARMUP_RESULT.');
			console.log(event);
			console.log(event.data.data.detections);
			
			if (typeof warmup_completed !== 'undefined') {
				// Execute all functions in the array
				if (warmup_completed.length > 0) {
					warmup_completed.forEach(func => func());
				}
			}else{
				setTimeout(faceapi_warmup, 10000);
			}
			
			break;
			default:
			console.log('Unknown message type:', event.data.type);
		}
	});
}

async function workerRegistration() {
	if (!('serviceWorker' in navigator)) {
		console.error('Service workers are not supported in this browser.');
		return;
	}

	// Ensure the scope of the SW covers the current page (script directory by default)
	const swScope = './js/';

	// Attempt to find an existing registration for our SW file within scope
	const registrations = await navigator.serviceWorker.getRegistrations();
	let registration = registrations.find(reg => reg.active && reg.active.scriptURL.endsWith(serviceWorkerFileName));

	if (!registration) {
		console.log('Registering new service worker');
		try {
			registration = await navigator.serviceWorker.register(serviceWorkerFilePath, { scope: swScope });
		} catch (err) {
			console.error('Service worker registration failed:', err);
			throw err;
		}
	}

	// Wait until the service worker is activated. Avoid using navigator.serviceWorker.ready
	if (!registration.active) {
		console.log('Waiting for service worker to activate...');

		await new Promise(resolve => {
			// If there is an installing worker listen for state changes
			const installingWorker = registration.installing || registration.waiting;
			if (!installingWorker) {
				// No worker yet (very unlikely) – resolve immediately
				return resolve();
			}

			if (installingWorker.state === 'activated') {
				return resolve();
			}

			installingWorker.addEventListener('statechange', evt => {
				if (evt.target.state === 'activated') {
					resolve();
				}
			});
		});
	}

	// After activation grab the worker reference
	worker = registration.active || registration.waiting || registration.installing;
	return worker;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function load_model() {
    if (!worker) {
        // Ensure we have a reference – this should usually not happen because
        // initWorker already awaited workerRegistration(), but keep it as a
        // safeguard.
        await workerRegistration();
    }

    if (worker) {
        worker.postMessage({ type: 'LOAD_MODELS' });
    } else {
        console.error('Unable to post message, worker is undefined');
    }
}

async function initWorker() {
    if ('serviceWorker' in navigator) {
        try {
            // Optionally uncomment if needed
            // await unregisterAllServiceWorker();

            console.log("Registering service worker...");
            await workerRegistration(); // Wait for worker registration

            console.log("Adding event listeners...");
            await initWorkerAddEventListener(); // Wait for event listeners to be added

            console.log("Waiting for 1 second...");
            await delay(500); // Wait for 1 second to give the service worker some time to activate. If not, when the service worker is created for the first time, posting a message will cause an error and stop everything.

            console.log("Loading model...");
            await load_model(); // Wait for the model to load
            
            isWorkerReady = true; // Set the worker as ready
            console.log("Worker initialized successfully.");
        } catch (error) {
            console.error("Error initializing worker:", error);
        }
    } else {
        console.error('Service workers are not supported in this browser.');
    }
}


function faceapi_warmup() {
	var img_face_for_loading = imgFaceFilePathForWarmup;
	if (img_face_for_loading) {
		var img = new Image();
		img.src = img_face_for_loading;
		img.onload = () => {
			
			// Create the canvas element
			let canvas_hidden = document.createElement('canvas');
			canvas_hidden.willReadFrequently = true; 
			canvas_hidden.style.display = 'none'; // Hide the canvas
			document.body.appendChild(canvas_hidden); // Append to the body
			let context = canvas_hidden.getContext("2d");

			canvas_hidden.width = img.width;
			canvas_hidden.height = img.height;
			context.drawImage(img, 0, 0, img.width, img.height);
			var imageData = context.getImageData(0, 0, img.width, img.height);
			worker.postMessage({
				type: 'WARMUP_FACES',
				imageData,
				width: img.width,
				height: img.height
			});
			canvas_hidden.remove();
		};
	}
}

// Main-thread fallback for environments without SW/OffscreenCanvas (e.g. iOS PWA)
async function startInMainThread() {
    console.log("Main-thread fallback: loading face-api models directly");
    await faceapi.nets.tinyFaceDetector.loadFromUri('../models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('../models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('../models');
    if (Array.isArray(warmup_completed)) {
        warmup_completed.forEach(func => func());
    }
}

// Initialize either service worker or fallback on main thread
document.addEventListener("DOMContentLoaded", async function(event) {
    console.log("DOMContentLoaded - checking Service Worker support");
    const canUseWorker = 'serviceWorker' in navigator && typeof OffscreenCanvas !== 'undefined';
    if (canUseWorker) {
        try {
            await initWorker();
        } catch (e) {
            console.warn("initWorker failed, falling back to main thread", e);
            await startInMainThread();
        }
    } else {
        console.warn("Service Worker or OffscreenCanvas not available; using main thread");
        await startInMainThread();
    }
});

// Add multi-face drawing utilities
function drawAllLandmarks(detectionsArray) {
    const video = document.getElementById(videoId);
    const canvas = document.getElementById(canvasId2);
    const ctx = canvas.getContext('2d');
    canvas.style.display = 'block';
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    detectionsArray.forEach(det => {
        const raw = det.landmarks._positions;
        const pts = raw.map(pt => ({ x: canvas.width - pt._x, y: pt._y }));
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#007ACC';
        ctx.lineWidth = 1;
        pts.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
        });
    });
}

function drawAllBoxesAndLabels(detectionsArray) {
    const video = document.getElementById(videoId);
    const canvas = document.getElementById(canvasId3);
    const ctx = canvas.getContext('2d');
    canvas.style.display = 'block';
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    detectionsArray.forEach(det => {
        const box = det.alignedRect._box;
        const confidence = det.detection._score;
        const mx = canvas.width - box._x - box._width;
        const my = box._y;
        let boxColor = 'red';
        if (confidence >= 0.8) boxColor = 'green'; else if (confidence >= 0.5) boxColor = 'yellow';
        ctx.beginPath(); ctx.rect(mx, my, box._width, box._height);
        ctx.lineWidth = 3; ctx.strokeStyle = boxColor; ctx.stroke();
        // Match user for label
        let matchedUser = { name: 'Unknown', id: 'Unknown' };
        let minDist = Infinity;
        flatRegisteredDescriptors.forEach((ref, idx) => {
            const dist = faceapi.euclideanDistance(det.descriptor, ref);
            if (dist < minDist && dist < vle_distance_rate) {
                minDist = dist;
                matchedUser = flatRegisteredUserMeta[idx];
            }
        });
        const labelText = `${matchedUser.name} (${matchedUser.id})`;
        ctx.font = '16px Arial';
        ctx.fillStyle = boxColor;
        ctx.textAlign = 'left';
        ctx.fillText(labelText, mx + 5, my + 15);
    });
}

function drawAllFaces(detectionsArray) {
    drawAllLandmarks(detectionsArray);
    drawAllBoxesAndLabels(detectionsArray);
}