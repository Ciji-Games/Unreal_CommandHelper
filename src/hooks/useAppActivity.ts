import { useEffect, useState } from 'react';

function getIsAppActive() {
  if (typeof document === 'undefined') {
    return true;
  }
  return document.visibilityState === 'visible' && document.hasFocus();
}

/**
 * Tracks whether the app is currently visible and focused.
 * Used to reduce/pause background polling when the app is not active.
 */
export function useAppActivity() {
  const [isActive, setIsActive] = useState<boolean>(() => getIsAppActive());

  useEffect(() => {
    const update = () => setIsActive(getIsAppActive());

    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);

    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return isActive;
}
