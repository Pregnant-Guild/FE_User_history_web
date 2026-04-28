interface item{
  file_metadata:string;
  id:string;
  mime_type:string;
  original_name:string;
  size:number;
  updated_at:string;
  user_id:string;
  storage_key:string;
}

export interface MediaDto {
  data?: item[];
  message?:string;
  status?:boolean;
}

export interface payloadPresignedMedia {
  filename:string;
  content_type:string;
}