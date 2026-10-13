import { authorTag, type Author } from "../storage/authors";

/** Fills a sentence's {name} with the author's name and their dimmed tag: "Added by Léa#A32F". */
export function authorText(document: Document, sentence: string, author: Author) {
  const [before = "", after = ""] = sentence.split("{name}");
  const tag = document.createElement("span");
  tag.className = "author-tag";
  tag.textContent = `#${authorTag(author.id)}`;
  return [before, author.name, tag, after];
}
