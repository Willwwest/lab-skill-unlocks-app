// Photos in the private 'photos' bucket. Paths are
// {org}/{athlete}/{photo id}.jpg and …_thumb.jpg; the photos table row
// links them to the kid so the bucket's policies can check who may see it.
import { supabase } from "./client.js";
import { photoPaths, status, dbId } from "./engine.js";
import { people } from "../domain.js";

export const remote = !!supabase;
const bucket = () => supabase.storage.from("photos");

export async function uploadPhoto(id, childId, full, thumb) {
  const { me } = status();
  if (!me?.org_id) throw Error("Sign in to save photos.");
  if (!people.some((p) => p.id === childId)) throw Error("Choose an athlete.");
  const athlete = dbId("athlete", childId);
  if (!athlete) throw Error("Choose an athlete.");
  const path = `${me.org_id}/${athlete}/${id}.jpg`;
  const thumbPath = `${me.org_id}/${athlete}/${id}_thumb.jpg`;
  for (const [p, blob] of [
    [path, full],
    [thumbPath, thumb],
  ]) {
    const { error } = await bucket().upload(p, blob, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (error) throw Error(`Couldn't upload the photo: ${error.message}`);
  }
  const { error } = await supabase.from("photos").insert({
    id,
    org_id: me.org_id,
    athlete_id: athlete,
    path,
    thumb_path: thumbPath,
    uploaded_by: me.staff_id,
  });
  if (error) throw Error(`Couldn't save the photo: ${error.message}`);
  photoPaths.set(id, { id, path, thumb_path: thumbPath });
}

async function pathsOf(id) {
  if (photoPaths.has(id)) return photoPaths.get(id);
  const { data } = await supabase
    .from("photos")
    .select("id, path, thumb_path")
    .eq("id", id)
    .maybeSingle();
  if (data) photoPaths.set(id, data);
  return data;
}

export async function signedPhotoUrl(id, size) {
  const p = await pathsOf(id);
  if (!p) return null;
  const { data } = await bucket().createSignedUrl(
    size === "thumb" ? p.thumb_path : p.path,
    60 * 60,
  );
  return data?.signedUrl ?? null;
}

export async function downloadPhoto(id) {
  const p = await pathsOf(id);
  if (!p) return null;
  const { data } = await bucket().download(p.path);
  return data ?? null;
}

export async function removePhoto(id) {
  const p = await pathsOf(id);
  if (!p) return;
  await bucket().remove([p.path, p.thumb_path]);
  await supabase.from("photos").delete().eq("id", id);
  photoPaths.delete(id);
}
