# Plan

## Face Registration Flow
- [ ] **User Input**
  - `face_register.html` includes fields for `User ID` and `User Name` which are used during registration.
- [ ] **Initialization**
  - `js/faceapi_warmup.js` sets `faceapi_action = "register"` when used from the registration page.
  - The script initializes a service worker that loads face-api models in the background.
- [ ] **Frame Processing**
  - Live video frames are captured to a hidden canvas and sent to the service worker for detection.
  - Detections trigger callbacks in `initWorkerAddEventListener()`.
- [ ] **Registration Logic (`faceapi_register`)**
  - Accepts face descriptors one at a time.
  - First descriptor is always accepted.
  - Subsequent descriptors must differ by more than `registrationSimilarityThreshold` (0.10) or after `maxRegistrationAttempts` attempts.
  - Accepted descriptors are pushed to `currentUserDescriptors`.
  - The progress bar (`registrationProgress`) updates with each accepted descriptor.
  - When `currentUserDescriptors.length` reaches `maxCaptures` (20) registration completes:
    - Alerts the user.
    - Stops the camera and disables further registration.
    - Downloads all captured descriptors as `faceid_with_users.json`.
- [ ] **Additional Checks**
  - `isConsistentWithCurrentUser` verifies new descriptors are similar to previous captures using `consistencyThreshold` (0.6).
  - `isDuplicateAcrossUsers` is a stub for future duplicate checks across users.
  - `drawRegistrationOverlay` shows a red/green bounding box to indicate recognition of previously captured descriptors.
- [ ] **Data Storage**
  - After registration, descriptors are flattened into `flatRegisteredDescriptors` for later verification.
  - Each descriptor is exported individually so that the server or client can store them as needed.

## Next Steps
- [ ] Implement real duplicate checking inside `isDuplicateAcrossUsers`.
- [ ] Persist registered users/descriptors to backend storage instead of downloading a file client-side.
- [ ] Improve user feedback for timeouts and errors.
- [ ] Display a progress bar during registration so users know how many captures remain.
