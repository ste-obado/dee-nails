import { imageUrl } from "../lib/api";

const TILES = ["#e3d0f4", "#f9c9dc", "#d3c1ee", "#fbd5e3"];

/** A service's photo (the first one unless `index` says otherwise), or a soft tile with the first letter. Always square. */
export default function ServicePhoto({ service, index = 0 }) {
  const path = service.images?.[index]?.url ?? (index === 0 ? service.image_url : null);
  const src = imageUrl(path);
  // "contain": show the whole photo on white (white-background product shots); "cover": fill and crop
  const fit = service.image_fit === "contain" ? " contain" : "";
  if (src) {
    return <img className={`photo${fit}`} src={src} alt={service.name} width="600" height="600" loading="lazy" draggable="false" />;
  }
  return (
    <div className="photo tile" style={{ background: TILES[service.id % TILES.length] }} aria-hidden="true">
      {service.name.charAt(0).toUpperCase()}
    </div>
  );
}
