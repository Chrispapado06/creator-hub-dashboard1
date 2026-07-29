import { useEffect } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { GripVertical } from "lucide-react";

import { Callout } from "./extensions/callout";
import { Toggle } from "./extensions/toggle";
import { FileBlock } from "./extensions/file-block";
import { PageImage } from "./extensions/image";
import { SlashCommand } from "./slash-command";

export function Editor({
  initialContent,
  editable = true,
  onChange,
}: {
  initialContent?: unknown;
  editable?: boolean;
  onChange?: (json: JSONContent) => void;
}) {
  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      PageImage,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Callout,
      Toggle,
      FileBlock,
      SlashCommand,
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading"
            ? "Heading"
            : "Write something, or press '/' for commands…",
        includeChildren: false,
      }),
    ],
    content: (initialContent as JSONContent) ?? { type: "doc", content: [] },
    onUpdate: ({ editor }) => onChange?.(editor.getJSON()),
    editorProps: {
      attributes: { class: "tiptap" },
    },
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  return (
    <div className="editor-shell">
      {editor && (
        <DragHandle editor={editor}>
          <div className="drag-handle" title="Drag to move, click for actions">
            <GripVertical className="size-4" />
          </div>
        </DragHandle>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
