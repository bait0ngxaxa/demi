export function HospitalContentImageList({ imageIds, title }: { imageIds: readonly string[]; title: string }): React.JSX.Element | null {
  if (imageIds.length === 0) return null;
  return <div className="mt-5 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2" aria-label={`ภาพประกอบ ${title}`}>
    {imageIds.map((imageId, index) => <figure className="min-w-0" key={imageId}>
      <img alt={`${title} ภาพที่ ${index + 1}`} className="max-h-[28rem] w-full rounded-panel border border-border object-contain" decoding="async" loading="lazy" src={`/api/hospital-content/images/${imageId}`} />
    </figure>)}
  </div>;
}
