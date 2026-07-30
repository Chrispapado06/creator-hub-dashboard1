import { useEffect } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import type { Editor as TiptapEditor, Range } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { GripVertical } from "lucide-react";

import { Callout } from "./extensions/callout";
import { Toggle } from "./extensions/toggle";
import { FileBlock } from "./extensions/file-block";
import { PageImage } from "./extensions/image";
import { PageLink } from "./extensions/page-link";
import { ColumnList, Column } from "./extensions/columns";
import { Video } from "./extensions/video";
import { Bookmark } from "./extensions/bookmark";
import { DatabaseView } from "./extensions/database-view";
import { SlashCommand } from "./slash-command";
import { BubbleToolbar } from "./BubbleToolbar";

export function Editor({
  initialContent,
  editable = true,
  onChange,
  onCreatePage,
  onCreateDatabase,
}: {
  initialContent?: unknown;
  editable?: boolean;
  onChange?: (json: JSONContent) => void;
  onCreatePage?: (editor: TiptapEditor, range: Range) => void;
  onCreateDatabase?: (editor: TiptapEditor, range: Range) => void;
}) {
  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      PageImage,
      Video,
      Bookmark,
      ColumnList,
      Column,
      DatabaseView,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Callout,
      Toggle,
      FileBlock,
      PageLink,
      SlashCommand.configure({
        onCreatePage: onCreatePage ?? null,
        onCreateDatabase: onCreateDatabase ?? null,
      }),
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
      {editor && editable && <BubbleToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
