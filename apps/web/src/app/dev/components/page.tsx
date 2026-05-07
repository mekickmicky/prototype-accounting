import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default function ComponentsDemo() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Components</h1>
      <p className="text-sm text-muted-foreground">
        Smoke test for shadcn/ui scaffold (T-1.2). Expanded in T-1.7.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Buttons</h2>
        <div className="flex gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Badges</h2>
        <div className="flex gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Input</h2>
        <Input placeholder="Type here..." className="max-w-sm" />
      </section>
    </main>
  );
}
