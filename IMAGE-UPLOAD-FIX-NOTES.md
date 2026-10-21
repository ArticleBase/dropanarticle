# Cover image upload fix

## What changed
- Replaced the clickable label-only uploader with an explicit `Choose image file…` button wired to the hidden file input.
- Added clear status text, upload progress handling, preview-load errors, and more useful Firebase Storage error messages.
- Clarified that the app is configured for the `dropanarticle.firebasestorage.app` bucket and direct upload requires Firebase Storage to be enabled and accessible.
- Preserved URL-based cover images so the site can continue to use a direct public HTTPS image URL.

## Important billing/configuration requirement
The Firebase Console screenshot showed the project on the Spark plan. Firebase's current documentation says Cloud Storage access for the `*.firebasestorage.app` default bucket requires the Blaze pay-as-you-go plan. This cannot be bypassed with browser JavaScript.

To enable direct uploads:
1. Upgrade the Firebase project to Blaze in Firebase Console > Project Overview > Upgrade.
2. Open Build > Storage and create/enable the project's default bucket if prompted. It should match `storageBucket` in `js/firebase.js` (`dropanarticle.firebasestorage.app`).
3. Publish the project's `storage.rules` file in Firebase Console > Storage > Rules. Keep the existing editor-role restrictions; do not replace them with public write access.
4. Sign back into the admin panel and retry an image upload.

If you do not want to enable billing, upload the image file manually into the website's GitHub repository (for example `images/articles/cover.webp`), commit it, and paste its full public URL into the Image URL field, such as `https://articlebase.github.io/dropanarticle/images/articles/cover.webp`.
