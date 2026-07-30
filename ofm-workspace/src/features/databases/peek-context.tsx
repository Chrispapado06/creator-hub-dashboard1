import { createContext, useContext, useState, type ReactNode } from "react";

interface PeekCtx {
  openId: string | null;
  open: (id: string) => void;
  close: () => void;
}

const Ctx = createContext<PeekCtx>({
  openId: null,
  open: () => {},
  close: () => {},
});

export function PeekProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Ctx.Provider
      value={{ openId, open: (id) => setOpenId(id), close: () => setOpenId(null) }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const usePeek = () => useContext(Ctx);
