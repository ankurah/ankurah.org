import { $, escape, setup } from "./shared.mjs";
import { albums, orderAlbums, includes } from "./model.mjs";
setup();
$("#key-list").innerHTML = albums
  .map(
    (a) =>
      `<div class="key-row" id="album-${a.id}" role="listitem"><strong>${a.year ?? "?"}</strong><span>${escape(a.title)}</span><small>${String(a.id).padStart(2, "0")}</small></div>`,
  )
  .join("");
function render() {
  const direction = $("#direction").value,
    nulls = $("#nulls").value;
  const from = Number($("#from").value),
    to = Number($("#to").value),
    end = $("#include-end").checked,
    all = $("#all").checked;
  let selected = 0;
  orderAlbums(direction, nulls).forEach((album, index) => {
    const chosen = includes(album, from, to, end, all),
      row = $(`#album-${album.id}`);
    if (chosen) selected++;
    row.style.transform = `translateY(${index * 53}px)`;
    row.className = `key-row ${chosen ? "selected" : "outside"}`;
    row.setAttribute(
      "aria-label",
      `${album.year ?? "Unknown year"}, ${album.title}, ID ${album.id}, ${chosen ? "inside" : "outside"} the view, position ${index + 1}`,
    );
    row.setAttribute("aria-posinset", index + 1);
    row.setAttribute("aria-setsize", albums.length);
    $("#key-list").append(row);
  });
  $("#caption").innerHTML =
    `<strong>${selected} in the view. All ${albums.length} remain in the tree.</strong><p>${all ? "The whole-tree view includes the unknown year." : `Years ${from} ≤ year ${end ? "≤" : "<"} ${to}. Missing years are excluded by this numeric range.`} Equal-year members keep their ID order.</p>`;
  for (const id of ["from", "to", "include-end"]) $(`#${id}`).disabled = all;
}
for (const control of document.querySelectorAll("select,input"))
  control.addEventListener("change", render);
render();
