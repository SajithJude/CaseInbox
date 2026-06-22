import { Badge } from "./ui";
import { categoryColor, categoryShort } from "@/lib/format";
import type { HarmCategory } from "@/lib/constants";

export function CategoryBadge({ category }: { category: HarmCategory }) {
  return <Badge color={categoryColor(category)}>{categoryShort(category)}</Badge>;
}
