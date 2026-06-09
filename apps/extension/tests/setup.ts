import { MotionGlobalConfig } from "framer-motion";

// jsdom has no real animation frame timeline, so AnimatePresence exit animations would
// never complete and `mode="wait"` would hold the next panel offscreen forever.
// Skipping animations makes presence transitions resolve synchronously in tests.
MotionGlobalConfig.skipAnimations = true;
