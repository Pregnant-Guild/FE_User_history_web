"use client";

import React, { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import "react-quill-new/dist/quill.snow.css";

const ReactQuillEditor = dynamic(
  async () => {
    const { default: RQ } = await import("react-quill-new");
    return ({ forwardedRef, ...props }: any) => (
      <RQ ref={forwardedRef} {...props} />
    );
  },
  {
    ssr: false,
    loading: () => (
      <div className="h-[480px] w-full animate-pulse bg-gray-100 rounded-lg" />
    ),
  },
);

interface EditorProps {
  value: string;
  onChange: (content: string) => void;
  handleImageUpload?: (file: File) => Promise<string>;
  onEditorReady?: () => void;
}

const RichTextEditor = ({
  value,
  onChange,
  handleImageUpload,
  onEditorReady,
}: EditorProps) => {
  const quillRef = useRef<any>(null);

  const modules = {
    toolbar: [
      [{ font: [] }, { size: [] }], 
      ["bold", "italic", "underline", "strike"], 
      [{ color: [] }, { background: [] }],
      [{ script: "sub" }, { script: "super" }], 
      [{ header: [1, 2, 3, 4, 5, 6, false] }], 
      ["blockquote", "code-block"], 
      [
        { list: "ordered" },
        { list: "bullet" },
        { indent: "-1" },
        { indent: "+1" },
      ],
      [{ direction: "rtl" }, { align: [] }], 
      ["link", "image", "video", "formula"], 
      ["clean"],
    ],
  };

  useEffect(() => {
    if (quillRef.current && handleImageUpload) {
      const quill = quillRef.current.getEditor();
      const toolbar = quill.getModule("toolbar");
      toolbar.addHandler("image", () => {
        const input = document.createElement("input");
        input.setAttribute("type", "file");
        input.setAttribute("accept", "image/*");
        input.click();
        input.onchange = async () => {
          const file = input.files?.[0];
          if (file) {
            try {
              const url = await handleImageUpload(file);
              const range = quill.getSelection();
              quill.insertEmbed(range?.index || 0, "image", url);
            } catch (error) {
              console.error("Upload failed", error);
            }
          }
        };
      });
    }
    onEditorReady?.();
  }, [handleImageUpload]);

  return (
    <div className="editor-container bg-white dark:bg-gray-900 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
      <ReactQuillEditor
        forwardedRef={quillRef}
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        className="min-h-[300px]"
        placeholder="Nhập nội dung tại đây..."
      />
    </div>
  );
};

export default RichTextEditor;
