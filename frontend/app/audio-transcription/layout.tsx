// 强制动态渲染
export const dynamic = 'force-dynamic';

export default function AudioTranscriptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}