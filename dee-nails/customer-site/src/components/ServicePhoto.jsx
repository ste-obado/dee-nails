import { imageUrl } from "../lib/api";

const TILES = ["#e3d0f4", "#f9c9dc", "#d3c1ee", "#fbd5e3"];

/** The photo Dee uploaded, or a soft coloured tile with the first letter. Always square. */
export default function ServicePhoto({ service }) {
  const src = imageUrl(service.image_url);
  if (src) return <img className="photo" src={src} alt={service.name} width="300" height="300" loading="lazy" />;
  return (
    <div className="photo tile" style={{ background: TILES[service.id % TILES.length] }} aria-hidden="true">
      {service.name.charAt(0).toUpperCase()}
    </div>
  );
}
