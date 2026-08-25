import { useEffect, useState } from "react";

/**
 * Whether the device currently has a network connection.
 *
 * `navigator.onLine` is honest about one thing only: whether there is a network
 * interface. It cannot tell you the mountain hut's wifi has no route to the
 * internet. So it is used for what it is good for — reacting the instant a
 * signal drops — and never as a promise that a request will succeed. Every
 * fetch in the app still has to handle failure on its own.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}
