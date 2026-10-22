import {notFound} from "next/navigation";
import {GalleryContent} from "@/app/design/GalleryContent";

export const metadata = {
  title: "Design gallery (dev)",
};

/** Dev-only component gallery: the liquid-glass brand layers and every shared UI primitive, on the
 * single light theme (docs/BRAND.md). The visual sign-off sheet for brand changes. Not reachable in
 * a production build. */
export default function DesignGalleryPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <div className="min-h-dvh p-6">
      <div className="mb-6">
        <h1 className="text-page-title text-ink">Design gallery</h1>
        <p className="text-body text-ink-muted">Dev-only. The brand kit and every shared component.</p>
      </div>
      <div className="mx-auto max-w-4xl">
        <GalleryContent />
      </div>
    </div>
  );
}
