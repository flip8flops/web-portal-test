export default function StatusPage() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Metagapura Portal';
  const buildTime = process.env.BUILD_TIME || 'unknown';

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Status</h1>
      <div className="rounded border bg-white p-4">
        <div>
          <span className="font-medium">App:</span> {appName}
        </div>
        <div>
          <span className="font-medium">Build time:</span> {buildTime}
        </div>
      </div>
    </section>
  );
}


