import { motion } from "framer-motion";

/* Shared motion language: snappy, physical, always under 300ms.
   Respects the user's OS "reduce motion" setting via MotionConfig
   (wired in App.jsx), so these are safe to use everywhere. */

export const EASE = [0.22, 1, 0.36, 1]; // easeOutExpo-ish
export const DUR = 0.22;

/* Container/child variants for staggered entrances (hero, chips, …) */
export const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export const riseChild = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.26, ease: EASE },
  },
};

/* View-to-view page transition (hero ⇄ convo ⇄ tool pages) */
export const viewMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: DUR, ease: EASE },
};

/* Generic mount fade for blocks that appear mid-flow (convo blocks, …) */
export function Rise({ children, className, delay = 0, ...rest }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export { motion };
