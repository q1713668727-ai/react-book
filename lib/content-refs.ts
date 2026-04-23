export type ContentType = 'note' | 'video';

export function contentRefKey(contentType: ContentType, id: string | number) {
  return `${contentType}-${String(id)}`;
}

export function hasContentRef(refs: Set<string>, contentType: ContentType, id: string | number) {
  const rawId = String(id);
  return refs.has(contentRefKey(contentType, rawId)) || refs.has(rawId);
}

export function setContentRef(refs: Set<string>, contentType: ContentType, id: string | number, active: boolean) {
  const next = new Set(refs);
  const rawId = String(id);
  const key = contentRefKey(contentType, rawId);
  next.delete(rawId);
  if (active) next.add(key);
  else next.delete(key);
  return next;
}
