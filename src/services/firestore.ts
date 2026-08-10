import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { app } from './firebase';

// TASK-178: split out of services/firebase.ts so importing `auth` (needed on
// EVERY boot, including the router guard's critical path) does not force a
// static import of `firebase/firestore` (112KB gzip, the larger half of the
// Firebase SDK) along with it. See the comment in firebase.ts for the full
// story. `app` is imported (not re-initialized) so initializeApp() still
// runs exactly once, in firebase.ts, before anything else touches Firebase —
// unchanged from before this split.
export const db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
});
