import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { JSONContent } from "@tiptap/react";
import type { Editor as TiptapEditor, Range } from "@tiptap/core";
import { toast } from "sonner";

import { FullScreenSpinner } from "@/components/full-screen-spinner";
import { Editor } from "@/features/editor/Editor";
import { useAuth } from "@/features/auth/auth-context";
import { useCurrentMember } from "@/features/auth/use-current-member";
import { cn } from "@/lib/utils";
import { IconPicker } from "./IconPicker";
import { PageIcon } from "./PageIcon";
import { PageMenu } from "./PageMenu";
import { ShareDialog } from "./ShareDialog";
import { useCreateDatabase } from "@/features/databases/use-databases";
import {
  useCreatePage,
  usePage,
  usePages,
  useSavePageContent,
  useUpdatePage,
  type PageNode,
} from "./use-pages";

export default function PageEditor() {
  const { pageId } = useParams();
  const { user } = useAuth();
  const { data: member } = useCurrentMember();
  const { data: page, isLoading, isError } = usePage(pageId);
  const { data: pages = [] } = usePages();
  const update = useUpdatePage();
  const saveContent = useSavePageContent();
  const createPage = useCreatePage();
  const createDatabase = useCreateDatabase();

  // Ancestor chain (root -> parent) for the breadcrumb trail, so from a deep
  // sub-page you can jump straight up to any parent or Home.
  const ancestors = useMemo<PageNode[]>(() => {
    if (!pageId) return [];
    const byId = new Map(pages.map((p) => [p.id, p]));
    const chain: PageNode[] = [];
    let cur = byId.get(pageId)?.parentId ?? page?.parentId ?? null;
    let guard = 0;
    while (cur && guard++ < 25) {
      const p = byId.get(cur);
      if (!p) break;
      chain.unshift(p);
      cur = p.parentId;
    }
    return chain;
  }, [pages, pageId, page?.parentId]);
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [fullWidth, setFullWidth] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Resync local state when navigating between pages.
  useEffect(() => {
    setTitle(page?.title ?? "");
    setIcon(page?.icon ?? null);
    setFullWidth(
      pageId ? localStorage.getItem(`ofm-fw-${pageId}`) === "1" : false,
    );
  }, [page?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleFullWidth() {
    setFullWidth((v) => {
      const next = !v;
      if (pageId) localStorage.setItem(`ofm-fw-${pageId}`, next ? "1" : "0");
      return next;
    });
  }

  const contentTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const titleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const onContentChange = useCallback(
    (json: JSONContent) => {
      if (!pageId) return;
      clearTimeout(contentTimer.current);
      contentTimer.current = setTimeout(
        () => saveContent.mutate({ id: pageId, content: json }),
        700,
      );
    },
    [pageId, saveContent],
  );

  // Notion-style "/page": create a child page, drop an inline link to it, save
  // this page, then open the new sub-page.
  const handleCreateSubpage = useCallback(
    async (editor: TiptapEditor, range: Range) => {
      if (!pageId) return;
      editor.chain().focus().deleteRange(range).run();
      try {
        const childId = await createPage.mutateAsync({ parentId: pageId });
        editor
          .chain()
          .focus()
          .insertContent({
            type: "pageLink",
            attrs: { pageId: childId, title: "Untitled" },
          })
          .run();
        await saveContent.mutateAsync({ id: pageId, content: editor.getJSON() });
        navigate(`/page/${childId}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [pageId, createPage, saveContent, navigate],
  );

  // "/database": create a database and embed it inline at the cursor.
  const handleCreateDatabase = useCallback(
    async (editor: TiptapEditor, range: Range) => {
      if (!pageId) return;
      editor.chain().focus().deleteRange(range).run();
      try {
        const dbId = await createDatabase.mutateAsync({});
        editor
          .chain()
          .focus()
          .insertContent({ type: "databaseView", attrs: { databaseId: dbId } })
          .run();
        await saveContent.mutateAsync({ id: pageId, content: editor.getJSON() });
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [pageId, createDatabase, saveContent],
  );

  function onTitleChange(v: string) {
    setTitle(v);
    if (!pageId) return;
    clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(
      () => update.mutate({ id: pageId, patch: { title: v } }),
      500,
    );
  }

  function pickIcon(emoji: string) {
    setIcon(emoji);
    if (pageId) update.mutate({ id: pageId, patch: { icon: emoji } });
  }
  function removeIcon() {
    setIcon(null);
    if (pageId) update.mutate({ id: pageId, patch: { icon: null } });
  }

  if (isLoading) return <FullScreenSpinner />;
  if (isError || !page)
    return (
      <div className="p-14 text-muted-foreground">
        This page doesn't exist or you don't have access.
      </div>
    );

  // Editing is allowed for owners/managers, or the page's own creator — mirrors
  // the pages_update RLS policy so edits are never silently dropped server-side.
  const canEdit =
    member?.role === "owner" ||
    member?.role === "manager" ||
    page.createdBy === user?.id;

  // Collapse very deep trails: first ancestor … last two ancestors.
  const crumbTrail: (PageNode | "ellipsis")[] =
    ancestors.length > 4
      ? [ancestors[0], "ellipsis", ...ancestors.slice(-2)]
      : ancestors;

  const bigIcon = (
    <PageIcon
      icon={icon}
      className="size-11"
      emojiClassName="text-5xl leading-none"
    />
  );

  return (
    <div
      className={cn(
        "mx-auto px-14 py-12",
        fullWidth ? "max-w-5xl" : "max-w-3xl",
      )}
    >
      <nav className="mb-2 flex items-center gap-0.5 overflow-x-auto text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate(-1)}
          title="Back"
          className="mr-1 shrink-0 rounded p-1 hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
        <Link
          to="/"
          className="shrink-0 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
        >
          Home
        </Link>
        {crumbTrail.map((a, i) =>
          a === "ellipsis" ? (
            <span key={`ellipsis-${i}`} className="flex shrink-0 items-center gap-0.5">
              <ChevronRight className="size-3.5 opacity-60" />
              <span className="px-1">…</span>
            </span>
          ) : (
            <span key={a.id} className="flex min-w-0 items-center gap-0.5">
              <ChevronRight className="size-3.5 shrink-0 opacity-60" />
              <Link
                to={`/page/${a.id}`}
                title={a.title || "Untitled"}
                className="flex min-w-0 max-w-[10rem] items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
              >
                <PageIcon
                  icon={a.icon}
                  className="size-4 shrink-0"
                  emojiClassName="text-sm leading-none"
                />
                <span className="truncate">{a.title || "Untitled"}</span>
              </Link>
            </span>
          ),
        )}
        <ChevronRight className="size-3.5 shrink-0 opacity-60" />
        <span className="flex min-w-0 max-w-[14rem] items-center gap-1 px-1.5 py-0.5 text-foreground">
          <PageIcon
            icon={icon}
            className="size-4 shrink-0"
            emojiClassName="text-sm leading-none"
          />
          <span className="truncate">{title || "Untitled"}</span>
        </span>
      </nav>

      <div className="mb-3 flex h-8 items-center justify-end gap-1">
        {!canEdit && (
          <span className="mr-auto text-xs text-muted-foreground">
            Read-only
          </span>
        )}
        {pageId && canEdit && (
          <ShareDialog
            pageId={pageId}
            published={page.published}
            publicToken={page.publicToken}
          />
        )}
        {canEdit && (
          <PageMenu
            page={{
              id: page.id,
              title,
              icon,
              content: page.content,
              parentId: page.parentId,
            }}
            fullWidth={fullWidth}
            onToggleFullWidth={toggleFullWidth}
            onRename={() => {
              titleRef.current?.focus();
              titleRef.current?.select();
            }}
          />
        )}
      </div>

      {canEdit ? (
        <IconPicker value={icon} onPick={pickIcon} onRemove={removeIcon}>
          {icon ? (
            <button className="mb-2 flex size-12 items-center justify-center transition-opacity hover:opacity-80">
              {bigIcon}
            </button>
          ) : (
            <button className="mb-3 block text-sm text-muted-foreground transition-colors hover:text-foreground">
              ＋ Add icon
            </button>
          )}
        </IconPicker>
      ) : icon ? (
        <div className="mb-2 flex size-12 items-center justify-center">
          {bigIcon}
        </div>
      ) : null}

      <input
        ref={titleRef}
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        readOnly={!canEdit}
        placeholder="Untitled"
        className="mb-3 w-full bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40"
      />

      <Editor
        key={page.id}
        initialContent={page.content}
        editable={canEdit}
        onChange={onContentChange}
        onCreatePage={canEdit ? handleCreateSubpage : undefined}
        onCreateDatabase={canEdit ? handleCreateDatabase : undefined}
      />
    </div>
  );
}
