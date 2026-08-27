import type { Favourite } from "./store.js";

const STYLE = `
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  max-width: 900px;
  margin: 2rem auto;
  padding: 0 1rem;
  color: #222;
  background: #fafafa;
}
h1 { margin-bottom: 0.25rem; }
.subtitle { color: #555; margin-top: 0; }
code { background: #eee; padding: 0.1rem 0.3rem; border-radius: 3px; }
table { width: 100%; border-collapse: collapse; background: #fff; margin-bottom: 2rem; }
th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; vertical-align: top; }
th { background: #f0f0f0; }
.thumb { width: 48px; height: 48px; object-fit: cover; border-radius: 4px; background: #eee; }
.reorder-cell form { display: inline; }
.reorder-cell button { width: 2rem; }
.url-cell { max-width: 260px; overflow-wrap: break-word; font-size: 0.85rem; color: #444; }
.actions-cell form { margin-top: 0.25rem; }
.edit-form { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.5rem; min-width: 260px; }
.edit-form label { display: flex; flex-direction: column; font-size: 0.85rem; }
.add-form { display: flex; flex-direction: column; gap: 0.6rem; max-width: 420px; background: #fff; padding: 1rem; border: 1px solid #ddd; border-radius: 6px; }
.add-form label { display: flex; flex-direction: column; font-size: 0.9rem; gap: 0.2rem; }
input[type="text"] { padding: 0.4rem; border: 1px solid #ccc; border-radius: 4px; font-size: 0.9rem; }
button { cursor: pointer; padding: 0.4rem 0.8rem; border: 1px solid #999; border-radius: 4px; background: #f5f5f5; }
button:hover { background: #e8e8e8; }
button.danger { border-color: #c0392b; color: #c0392b; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
.errors { background: #fdecea; border: 1px solid #f5c6cb; color: #a11; padding: 0.6rem 1rem; border-radius: 4px; margin-bottom: 1rem; }
.empty { text-align: center; color: #888; }
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function favouriteRow(fav: Favourite, isFirst: boolean, isLast: boolean): string {
  return `
      <tr>
        <td class="reorder-cell">
          <form method="post" action="/move/${fav.id}/up">
            <button type="submit" ${isFirst ? "disabled" : ""} title="Move up">&uarr;</button>
          </form>
          <form method="post" action="/move/${fav.id}/down">
            <button type="submit" ${isLast ? "disabled" : ""} title="Move down">&darr;</button>
          </form>
        </td>
        <td><img class="thumb" src="${escapeHtml(fav.image_url)}" alt="" onerror="this.style.visibility='hidden'"></td>
        <td>${escapeHtml(fav.name)}</td>
        <td class="url-cell">${escapeHtml(fav.webhook_url)}</td>
        <td class="actions-cell">
          <details>
            <summary>Edit</summary>
            <form method="post" action="/edit/${fav.id}" class="edit-form">
              <label>Name<input type="text" name="name" value="${escapeHtml(fav.name)}" required></label>
              <label>Image URL<input type="text" name="image_url" value="${escapeHtml(fav.image_url)}" required></label>
              <label>Webhook URL<input type="text" name="webhook_url" value="${escapeHtml(fav.webhook_url)}" required></label>
              <button type="submit">Save</button>
            </form>
          </details>
          <form method="post" action="/delete/${fav.id}" onsubmit="return confirm('Delete this favourite?');">
            <button type="submit" class="danger">Delete</button>
          </form>
        </td>
      </tr>`;
}

export function renderIndex(favourites: Favourite[], errors: string[] = []): string {
  const rows = favourites.length
    ? favourites
        .map((fav, i) => favouriteRow(fav, i === 0, i === favourites.length - 1))
        .join("")
    : `<tr><td colspan="5" class="empty">No favourites yet. Add one below.</td></tr>`;

  const errorBlock = errors.length
    ? `<div class="errors"><ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul></div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sonos Panel Favourites</title>
  <style>${STYLE}</style>
</head>
<body>
  <h1>Sonos Panel Favourites</h1>
  <p class="subtitle">
    Manage the tiles shown on the panel's Playlists/Radio screen. The panel fetches
    <code>/favourites.json</code> directly; this page is just for editing the list.
  </p>

  ${errorBlock}

  <table>
    <thead>
      <tr>
        <th>Order</th>
        <th>Image</th>
        <th>Name</th>
        <th>Webhook URL</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>

  <h2>Add a favourite</h2>
  <form method="post" action="/add" class="add-form">
    <label>Name
      <input type="text" name="name" placeholder="Dinner Party Playlist" required>
    </label>
    <label>Image URL
      <input type="text" name="image_url" placeholder="http://homeassistant.local:8123/local/dinner.png" required>
    </label>
    <label>Webhook URL
      <input type="text" name="webhook_url" placeholder="http://homeassistant.local:8123/api/webhook/abc123" required>
    </label>
    <button type="submit">Add favourite</button>
  </form>

  <h2>Panel JSON feed</h2>
  <p>
    Point the panel firmware at: <code>http://&lt;this-host&gt;:8099/favourites.json</code>
    (<a href="/favourites.json">view current JSON</a>)
  </p>
</body>
</html>`;
}
