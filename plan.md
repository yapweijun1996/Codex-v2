# Face Register UI/UX Improvements

- [x] Display a full screen loading overlay while face-api models warm up.
- [x] Hide the loader once warm up completes using the `warmup_completed` callback.
- [x] Keep the orientation overlay to prompt portrait mode on mobile.
- [x] Provide touch-friendly controls with large buttons.

## Next Steps

- [x] Add a smooth fade-out animation when hiding the loader.
- [x] Show thumbnail previews for each captured frame.
 - [x] Improve progress indication on smaller screens.
- [x] Evaluate performance on low-end devices and adjust detection settings.
- [x] Add fallback instructions for browsers without camera permission.
- [x] Persist registration progress in local storage.
- [x] Provide more descriptive error messages for detection failures.
- [x] Explore offline registration and syncing options.

### Future Work

- [ ] Implement server-side API to upload stored registrations
- [ ] Provide user feedback when offline or syncing fails
- [ ] Option to clear local registrations after successful sync
