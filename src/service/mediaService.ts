import api from "@/config/config";
import { API } from "../../api";
import { payloadPresignedMedia } from "@/interface/media";
import axios from "axios";

export const apiGetCurrentUserMedia = async (
  payload: payloadPresignedMedia,
) => {
  const response = await api.get(API.Media.PRESIGNED, {
    params: payload,
  });
  return response?.data;
};

export type FileType =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "docx"
  | "text"
  | "other";

export const getFileType = (mime: string): FileType => {
  if (!mime) return "other";

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";

  if (mime === "application/pdf") return "pdf";

  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";

  if (mime.startsWith("text/")) return "text";

  return "other";
};

type PreSignedResponse = {
  token_id: string;
  upload_url: string;
  storage_key: string;
  signed_headers: Record<string, string>;
};

export const uploadFileToS3 = async (
  file: File,
  presigned: PreSignedResponse,
) => {
  const res = await axios.put(presigned.upload_url, file, {
    headers: {
      ...presigned.signed_headers,
      "Content-Type": file.type,
    },
  });
  // console.log("Response from S3 upload:", res);
};

export const confirmUpload = async (token_id: string) => {
  const res = await api.post("/media/presigned/complete", {
    token_id,
  });
  // console.log("Response from confirm upload:", res);
  return res.data;
};

export const uploadMedia = async (file: File) => {
  const { data: presigned } = await api.get<PreSignedResponse>(
    "/media/presigned",
    {
      params: {
        fileName: file.name,
        content_type: file.type,
        size: file.size,
      },
    },
  );
  // console.log("Presigned URL:", presigned);

  await uploadFileToS3(file, presigned);

  const media = await confirmUpload(presigned.token_id);
  // console.log("Media sau khi upload:", media);
  return media;
};

export const getPresignedUrl = async (file: File) => {
  const { data: presigned } = await api.get<PreSignedResponse>(
    "/media/presigned",
    {
      params: {
        fileName: file.name,
        content_type: file.type,
        size: file.size,
      },
    },
  );
  // console.log("Presigned URL:", presigned);
  return presigned;
};

export const getMediaById = async (mediaId: number | string) => {
  const response = await api.get(API.Media.GET_MEDIA_BY_ID(mediaId));
  return response?.data;
}

export const deleteMedia = async (mediaIds: string[]) => {
  const response = await api.delete(API.Media.DELETE_MEDIA, {
    data: {
      media_ids: mediaIds 
    }
  });
  return response?.data;
}
export const deleteMediaById = async (mediaId: string) => {
  const response = await api.delete(API.Media.DELETE_MEDIA_BY_ID(mediaId));
  return response?.data;
}

export const getMedia = async (payload: any) => {
  const response = await api.get(API.Media.GET_MEDIA, {
    params: payload,
  });
  return response?.data;
}