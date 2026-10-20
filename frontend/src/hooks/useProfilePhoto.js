import { useEffect, useState } from "react";
import { authService } from "../api/auth";

// Avatar bytes require the session's Authorization header; no public bucket ACL.
export function useProfilePhoto(user) {
  const key = `${user?.id || ""}:${user?.avatar_url || ""}`;
  const [photo, setPhoto] = useState({ key: "", image: "" });
  useEffect(() => {
    setPhoto({ key, image: "" });
    if (!user?.id || !user?.avatar_url) return;
    const controller = new AbortController();
    authService.getProfilePhoto({ signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted && /^data:image\/(jpeg|png|webp);base64,/.test(data?.image || "")) setPhoto({ key, image: data.image });
    }).catch(() => { /* Missing/private/unavailable photo: retain the default image. */ });
    return () => controller.abort();
  }, [user?.id, user?.avatar_url]);
  return photo.key === key ? photo.image : "";
}
