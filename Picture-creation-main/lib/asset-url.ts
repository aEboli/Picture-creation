export type AssetUrlOptions = {
  width?: number;
  quality?: number;
  download?: boolean;
};

export function buildAssetUrl(assetId: string, options: AssetUrlOptions = {}) {
  const params = new URLSearchParams();

  if (options.download) {
    params.set("download", "1");
  }
  if (typeof options.width === "number" && Number.isFinite(options.width) && options.width > 0) {
    params.set("w", String(Math.round(options.width)));
  }
  if (typeof options.quality === "number" && Number.isFinite(options.quality) && options.quality > 0) {
    params.set("q", String(Math.round(options.quality)));
  }

  const query = params.toString();
  return query ? `/api/assets/${assetId}?${query}` : `/api/assets/${assetId}`;
}
