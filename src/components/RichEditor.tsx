'use client';

import React, { useCallback } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';

interface RichEditorProps {
    content?: string;
    onChange?: (html: string) => void;
    placeholder?: string;
    editable?: boolean;
    minHeight?: number;
}

interface ToolbarButtonProps {
    onClick: () => void;
    isActive?: boolean;
    label: string;
    icon: string;
    disabled?: boolean;
}

function ToolbarButton({ onClick, isActive, label, icon, disabled }: ToolbarButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={label}
            style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: isActive ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontSize: '0.85rem',
                fontWeight: isActive ? 600 : 400,
                transition: 'all 0.15s',
                opacity: disabled ? 0.4 : 1,
            }}
            onMouseEnter={e => {
                if (!disabled) (e.target as HTMLElement).style.background = 'rgba(99,102,241,0.12)';
            }}
            onMouseLeave={e => {
                (e.target as HTMLElement).style.background = isActive ? 'rgba(99,102,241,0.2)' : 'transparent';
            }}
        >
            {icon}
        </button>
    );
}

function ToolbarDivider() {
    return <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 4px' }} />;
}

function Toolbar({ editor }: { editor: Editor }) {
    const addImage = useCallback(() => {
        const url = window.prompt('Image URL:');
        if (url) editor.chain().focus().setImage({ src: url }).run();
    }, [editor]);

    const addLink = useCallback(() => {
        const url = window.prompt('Link URL:');
        if (url) editor.chain().focus().setLink({ href: url }).run();
        else editor.chain().focus().unsetLink().run();
    }, [editor]);

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 2, padding: '6px 8px',
            borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap',
            background: 'rgba(0,0,0,0.1)', borderRadius: '8px 8px 0 0',
        }}>
            <ToolbarButton icon="B" label="Bold" onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} />
            <ToolbarButton icon="I" label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} />
            <ToolbarButton icon="S̶" label="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} />
            <ToolbarButton icon="<>" label="Code" onClick={() => editor.chain().focus().toggleCode().run()} isActive={editor.isActive('code')} />

            <ToolbarDivider />

            <ToolbarButton icon="H1" label="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} />
            <ToolbarButton icon="H2" label="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} />
            <ToolbarButton icon="H3" label="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} />
            <ToolbarButton icon="¶" label="Paragraph" onClick={() => editor.chain().focus().setParagraph().run()} isActive={editor.isActive('paragraph')} />

            <ToolbarDivider />

            <ToolbarButton icon="•" label="Bullet List" onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} />
            <ToolbarButton icon="1." label="Ordered List" onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} />
            <ToolbarButton icon="❝" label="Blockquote" onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} />
            <ToolbarButton icon="—" label="Horizontal Rule" onClick={() => editor.chain().focus().setHorizontalRule().run()} />

            <ToolbarDivider />

            <ToolbarButton icon="🔗" label="Link" onClick={addLink} isActive={editor.isActive('link')} />
            <ToolbarButton icon="🖼️" label="Image" onClick={addImage} />
            <ToolbarButton icon="{ }" label="Code Block" onClick={() => editor.chain().focus().toggleCodeBlock().run()} isActive={editor.isActive('codeBlock')} />

            <ToolbarDivider />

            <ToolbarButton icon="↩" label="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} />
            <ToolbarButton icon="↪" label="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} />
        </div>
    );
}

export default function RichEditor({ content = '', onChange, placeholder = 'Start writing...', editable = true, minHeight = 300 }: RichEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3, 4] },
            }),
            Placeholder.configure({ placeholder }),
            Link.configure({ openOnClick: false, HTMLAttributes: { class: 'editor-link' } }),
            Image.configure({ HTMLAttributes: { class: 'editor-image' } }),
        ],
        content,
        editable,
        onUpdate: ({ editor }) => {
            onChange?.(editor.getHTML());
        },
        editorProps: {
            attributes: {
                style: `min-height: ${minHeight}px; padding: 16px; outline: none; font-size: 0.95rem; line-height: 1.7; color: var(--text-primary);`,
            },
        },
    });

    if (!editor) return null;

    return (
        <div style={{
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            overflow: 'hidden',
            background: 'var(--bg-secondary, rgba(0,0,0,0.15))',
        }}>
            {editable && <Toolbar editor={editor} />}
            <EditorContent editor={editor} />
            <style>{`
                .tiptap p.is-editor-empty:first-child::before {
                    content: attr(data-placeholder);
                    float: left;
                    color: var(--text-muted);
                    pointer-events: none;
                    height: 0;
                }
                .tiptap h1 { font-size: 1.8rem; font-weight: 800; margin: 1em 0 0.5em; }
                .tiptap h2 { font-size: 1.4rem; font-weight: 700; margin: 1em 0 0.4em; }
                .tiptap h3 { font-size: 1.15rem; font-weight: 600; margin: 0.8em 0 0.3em; }
                .tiptap p { margin: 0.5em 0; }
                .tiptap ul, .tiptap ol { padding-left: 1.5em; margin: 0.5em 0; }
                .tiptap blockquote { border-left: 3px solid var(--accent-primary); padding-left: 1em; margin: 0.5em 0; color: var(--text-secondary); }
                .tiptap code { background: rgba(99,102,241,0.12); padding: 2px 6px; border-radius: 4px; font-size: 0.85em; }
                .tiptap pre { background: rgba(0,0,0,0.3); padding: 12px; border-radius: 6px; overflow-x: auto; }
                .tiptap pre code { background: none; padding: 0; }
                .tiptap hr { border: none; border-top: 1px solid var(--border-subtle); margin: 1em 0; }
                .editor-link { color: var(--accent-primary); text-decoration: underline; cursor: pointer; }
                .editor-image { max-width: 100%; height: auto; border-radius: 8px; margin: 0.5em 0; }
                .tiptap:focus { outline: none; }
            `}</style>
        </div>
    );
}
