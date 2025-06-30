"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Password Reset</CardTitle>
          <CardDescription>
            Password reset functionality is handled through the authentication provider.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">
                             To reset your password, please log out and use the &quot;Forgot Password&quot; option on the login page.
            </p>
            <div className="flex gap-2">
              <Button asChild className="flex-1">
                <Link href="/auth">Go to Login</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link href="/">Return Home</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
