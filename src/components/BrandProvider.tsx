"use client";

import {createContext, useContext, type ReactNode} from "react";
import {brandFor, type AppMode, type Brand} from "@/lib/brand";

const BrandContext = createContext<Brand>(brandFor("clinic"));

/** Seeded by the root layout with the server's DOGTAG_APP_MODE, so client components render the
 * same wording during SSR and after hydration. */
export function BrandProvider({mode, children}: {mode: AppMode; children: ReactNode}) {
  return <BrandContext.Provider value={brandFor(mode)}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  return useContext(BrandContext);
}
