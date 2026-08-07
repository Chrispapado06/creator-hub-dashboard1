import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import type { Editor as TiptapEditor, Range } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
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
import { Copy, GripVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { uploadAsset } from "./upload";
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

/** Stable empty doc so an empty page's `content` keeps a constant identity. */
const EMPTY_DOC: JSONContent = { type: "doc", content: [] };

/** Pick the right block for a dropped/pasted file (reel -> video, etc.). */
function nodeForFile(file: File, path: string, name: string, size: number) {
  const isVideo =
    file.type.startsWith("video/") || /\.(mp4|mov|webm|m4v|ogv)$/i.test(name);
  const isImage =
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(name);
  if (isVideo) return { type: "video", attrs: { path } };
  if (isImage) return { type: "image", attrs: { path, alt: name } };
  return { type: "fileBlock", attrs: { path, name, size } };
}

/** Upload dropped/pasted files to storage and insert them as blocks. */
async function uploadFilesInto(
  editor: TiptapEditor,
  files: File[],
  pos: number | null,
) {
  let at = pos;
  for (const file of files) {
    const tid = toast.loading(`Uploading ${file.name}…`);
    try {
      const { path, name, size } = await uploadAsset(file);
      const node = nodeForFile(file, path, name, size);
      if (at != null) editor.chain().focus().insertContentAt(at, node).run();
      else editor.chain().focus().insertContent(node).run();
      at = null; // subsequent files append after the first
      toast.success(`${file.name} added`, { id: tid });
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    }
  }
}

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
  // Keep the latest callbacks in refs so the editor options below can be created
  // ONCE (stable identity). Re-creating extensions/editorProps every render made
  // TipTap re-run setOptions on each render (e.g. after autosave), which closed
  // the open slash menu after a second or two.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCreatePageRef = useRef(onCreatePage);
  onCreatePageRef.current = onCreatePage;
  const onCreateDatabaseRef = useRef(onCreateDatabase);
  onCreateDatabaseRef.current = onCreateDatabase;
  const editorRef = useRef<TiptapEditor | null>(null);
  const contentRef = useRef(initialContent); // captured once; the editor owns the doc after

  const extensions = useMemo(
    () => [
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
        onCreatePage: onCreatePage
          ? (e, r) => onCreatePageRef.current?.(e, r)
          : null,
        onCreateDatabase: onCreateDatabase
          ? (e, r) => onCreateDatabaseRef.current?.(e, r)
          : null,
      }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading"
            ? "Heading"
            : "Write something, or press '/' for commands…",
        includeChildren: false,
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editorProps = useMemo(
    () => ({
      attributes: { class: "tiptap" },
      // Drag a downloaded reel/image/file onto the page -> upload + embed.
      handleDrop: (view: EditorView, event: Event, _slice: unknown, moved: boolean) => {
        if (moved) return false; // internal block re-order, let TipTap handle it
        const dt = (event as DragEvent).dataTransfer;
        const files = dt ? Array.from(dt.files) : [];
        if (!files.length || !view.editable) return false;
        event.preventDefault();
        const coords = view.posAtCoords({
          left: (event as DragEvent).clientX,
          top: (event as DragEvent).clientY,
        });
        const ed = editorRef.current;
        if (ed) void uploadFilesInto(ed, files, coords?.pos ?? null);
        return true;
      },
      // Paste an image/video file from the clipboard -> upload + embed.
      handlePaste: (view: EditorView, event: Event) => {
        const cd = (event as ClipboardEvent).clipboardData;
        const files = cd ? Array.from(cd.files) : [];
        if (!files.length || !view.editable) return false;
        event.preventDefault();
        const ed = editorRef.current;
        if (ed) void uploadFilesInto(ed, files, null);
        return true;
      },
    }),
    [],
  );

  const editor = useEditor({
    editable,
    extensions,
    content: (contentRef.current as JSONContent) ?? EMPTY_DOC,
    onUpdate: ({ editor }) => onChangeRef.current?.(editor.getJSON()),
    editorProps,
  });
  editorRef.current = editor;

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  // The block the drag-handle is currently hovering (for its Delete/Duplicate menu).
  const handlePos = useRef<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  function deleteBlock() {
    setMenuOpen(false);
    const pos = handlePos.current;
    if (pos == null || !editor) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run();
  }
  function duplicateBlock() {
    setMenuOpen(false);
    const pos = handlePos.current;
    if (pos == null || !editor) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    editor
      .chain()
      .focus()
      .insertContentAt(pos + node.nodeSize, node.toJSON())
      .run();
  }

  return (
    <div className="editor-shell">
      {editor && (
        <DragHandle
          editor={editor}
          onNodeChange={(d) => {
            handlePos.current = d.pos;
          }}
        >
          <div className="relative">
            <button
              type="button"
              className="drag-handle"
              title="Drag to move · click for actions"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
            >
              <GripVertical className="size-4" />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute left-0 top-full z-50 mt-1 min-w-36 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
                  <button
                    type="button"
                    onClick={duplicateBlock}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <Copy className="size-4" /> Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={deleteBlock}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
                  >
                    <Trash2 className="size-4" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </DragHandle>
      )}
      {editor && editable && <BubbleToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
