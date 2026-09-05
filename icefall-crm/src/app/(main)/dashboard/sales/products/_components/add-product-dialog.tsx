"use client";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * The old screen's "Add Product" button carried no handler, and the reason was
 * written beside it: products are created by operators in the operator portal
 * and reach the CRM through approval. This dialog states that instead of
 * offering a create form the CRM has no right to write.
 */
export function AddProductDialog({ children }: { children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Product</DialogTitle>
          <DialogDescription>Products are not created here.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm leading-relaxed">
          <p>
            Operators create their own expeditions and treks in the operator portal. Each one arrives in the CRM for
            approval and appears in this catalogue once it is approved.
          </p>
          <p className="text-muted-foreground">
            This button is waiting on that link-up. There is deliberately no create form on this screen: a product
            written from the CRM would have no operator behind it.
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
