import { redirect } from "next/navigation";

export default function EditorIndexPage() {
    // Editor must be opened from a specific project (see /user/projects).
    redirect("/user/projects");
}

