# Personal Diary

The Reflections page became the Personal Diary (`/diary`; `/reflections`
redirects there). It is private writing, kept apart from the study record.
Code: `src/lib/diary.ts`, the page and `src/components/diary/`.

## Writing

- A title (optional) and the entry, with light formatting kept as plain
  Markdown: **bold**, *italic*, `## ` headings, `- ` and `1. ` lists, `> `
  quotes. The toolbar and Ctrl/Cmd+B and +I add the marks; Preview shows them.
  `parseDiary` turns the text into plain blocks that are drawn as React
  elements, never as HTML, so nothing in an entry can run.
- It saves by itself 1.2 seconds after you stop typing, and when you leave the
  entry, the page or the tab. A new entry is kept only once it has a title,
  words or a file. The footer shows the word and character counts and when it
  last saved.
- A date (any day up to today), a category, tags, pinned and important flags,
  optional prompts, and attachments (the same private storage, limits and
  de-duplication as journal files).
- Focus mode hides everything but the page; Escape leaves it.

## Finding

A list (pinned first), a timeline by month and a calendar; search across the
title, the words, tags, category and prompt; filters for pinned, important,
with files, a category and a tag. Export one entry, or every entry shown, as
Markdown.

## Privacy

Only this page reads an entry's words. In particular:

- Performance Review and the Study Coach have no access: their inputs leave
  the diary out by type (`PerformanceData`, `CoachInput`).
- No habit counts diary entries, and nothing scores mood or sentiment. The old
  reflection journal's mood trend and gratitude tally are retired; an older
  entry still shows the mood and gratitude it recorded.
- A goal you set to count diary entries uses the number of entries in its
  window, nothing else.
- Files attached only in the diary don't appear in the journal's file picker.
- The reminder dispatcher receives diary entries as dates only (for the
  "diary gap" reminder), with no title, words, tags, flags, mood or files.

## Compatibility

The type stays `Reflection` and the store key `reflections`, so every
reflection is a diary entry with its id. New optional fields: `title`, `tags`,
`category`, `pinned`, `important`, `fileIds`, `createdAt`, `updatedAt`. `mood`
and `gratitude` are kept on the entries that have them. Diary files count as
owners when unused files are cleaned up, and deleting an entry lets go of
files nothing else uses.
