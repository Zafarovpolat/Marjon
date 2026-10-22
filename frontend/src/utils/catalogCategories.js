// Existing category storage distinguishes catalog sections by slug prefix.
// Unprefixed legacy rows were created by the old Dishes page: keep them there,
// but never include the explicit goods/raw/semi namespaces in the dishes list.
export function categoryBelongsToKind(category, kind) {
  if (!category) return false;
  const slug = String(category.slug || "").toLowerCase();
  if (kind === "dish") return !["sales", "raw", "semi"].some((prefix) => slug.startsWith(prefix));
  return ["sales", "raw", "semi"].includes(kind) && slug.startsWith(kind);
}
