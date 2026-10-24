/** Cover image of a content card; a "n รูป" badge tells readers that more images are on the detail page. */
export function HospitalContentImageList({
  imageIds,
  layout = "default",
  title,
}: {
  imageIds: readonly string[];
  layout?: "default" | "home";
  title: string;
}): React.JSX.Element | null {
  const [coverId] = imageIds;
  if (coverId === undefined) return null;
  return (
    <div className="mt-5 min-w-0" aria-label={`ภาพประกอบ ${title}`}>
      <figure className="relative aspect-video min-w-0 overflow-hidden rounded-panel border border-border">
        <img
          alt={`${title} ภาพที่ 1`}
          className={layout === "home" ? "h-full w-full object-cover" : "h-full w-full bg-surface-muted object-contain"}
          decoding="async"
          loading="lazy"
          src={`/api/hospital-content/images/${coverId}`}
        />
        {imageIds.length > 1 ? (
          <figcaption className="absolute bottom-2 right-2 rounded-control bg-text px-2.5 py-1 text-xs font-medium text-white">{imageIds.length} รูป</figcaption>
        ) : null}
      </figure>
    </div>
  );
}
