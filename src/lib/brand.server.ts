import "server-only";
import {brandFor, type Brand} from "@/lib/brand";
import {getServerEnv} from "@/lib/env";

/** This deployment's brand, from DOGTAG_APP_MODE (see src/lib/brand.ts). */
export function serverBrand(): Brand {
  return brandFor(getServerEnv().DOGTAG_APP_MODE);
}
