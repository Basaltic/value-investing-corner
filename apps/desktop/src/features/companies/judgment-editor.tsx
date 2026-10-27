import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
export function JudgmentEditor({
  document,
  editable,
  onChange,
}: {
  document: JSONContent;
  editable: boolean;
  onChange?: (content: JSONContent) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } })],
    content: document,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": editable ? "判断自由正文" : "正式判断只读正文",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => onChange?.(editor.getJSON()),
  });
  useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editor, editable]);
  return (
    <div className="judgment-editor">
      {editable && editor && (
        <>
          <div className="toolbar">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              aria-pressed={editor.isActive("bold")}
            >
              加粗
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              斜体
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              列表
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              正文批注/引用
            </button>
          </div>
          <details>
            <summary>可选研究提纲（不要求填写）</summary>
            <div className="toolbar">
              {["护城河", "管理层", "资本配置", "风险与反证"].map((title) => (
                <button
                  type="button"
                  key={title}
                  onClick={() =>
                    editor
                      .chain()
                      .focus()
                      .insertContent([
                        {
                          type: "heading",
                          attrs: { level: 2 },
                          content: [{ type: "text", text: title }],
                        },
                        { type: "paragraph" },
                      ])
                      .run()
                  }
                >
                  插入{title}
                </button>
              ))}
            </div>
          </details>
        </>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
