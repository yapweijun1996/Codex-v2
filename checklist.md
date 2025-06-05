# Face Registration & UI/UX Improvements Checklist

- [x] Progress indicator showing number of captures completed during registration
- [x] Clear on-screen tips guiding the user to face the camera and move slowly
- [x] Display remaining captures and allow retakes before final submission
- [x] Alert when more than one face is detected to avoid incorrect enrollment
- [x] Responsive layout updates for small screen/mobile devices
- [x] Detect device orientation and prompt users to rotate to portrait
- [x] Use full-screen overlay to focus camera feed on mobile
- [x] Large touch-friendly buttons for capture and controls
- [x] Option to cancel or restart registration from the page
- [x] Preview captured frames so users can confirm quality
- [x] Improve error messages with specific instructions when registration fails
- [x] Consider storing registrations locally with IndexedDB for offline flow


## Descriptor Accuracy & Reliability

- [x] Calibrate `registrationSimilarityThreshold`, `consistencyThreshold`, and `vle_distance_rate` using real-world samples.
- [x] Average accepted descriptors to create a mean descriptor per user.
- [x] Reject captures with low quality (blur, extreme angles, poor lighting).
- [x] Log the distance between each attempt to refine thresholds.
- [x] Verify new captures are unique across all users to prevent duplicates.

## Planned Changes

- [x] Move registration progress storage from `localStorage` to IndexedDB.
- [x] Stop persisting completed registrations in IndexedDB and download them only.
