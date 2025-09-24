"use client";

export default function BillingPage() {
  return null;
  // const { customer, openBillingPortal } = useCustomer();

  // return (
  //   <div className="container mx-auto py-8 space-y-6">
  //     <div>
  //       <h1 className="text-2xl font-bold">Billing Settings</h1>
  //       <p className="text-muted-foreground">
  //         Manage your subscription and payment methods
  //       </p>
  //     </div>

  //     {/* Current Subscription */}
  //     <Card>
  //       <CardHeader>
  //         <CardTitle>Current Subscription</CardTitle>
  //         <CardDescription>
  //           {customer?.products?.[0]?.status === "active"
  //             ? "You have an active subscription"
  //             : "No active subscription"}
  //         </CardDescription>
  //       </CardHeader>
  //       <CardContent>
  //         <div className="flex items-center justify-between">
  //           <div>
  //             <p className="font-medium">
  //               {customer?.products?.[0]?.name || "Free Plan"}
  //             </p>
  //             <p className="text-sm text-muted-foreground">
  //               {customer?.products?.[0]?.status === "active"
  //                 ? `Renews on ${customer.products[0].current_period_end ?? ""}`
  //                 : "Upgrade to access premium features"}
  //             </p>
  //           </div>
  //           <Button
  //             onClick={() =>
  //               openBillingPortal({
  //                 returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  //               })
  //             }
  //             variant="outline"
  //           >
  //             Adjust
  //           </Button>
  //         </div>
  //       </CardContent>
  //     </Card>

  //     {/* Payment Method */}
  //     <Card>
  //       <CardHeader>
  //         <CardTitle>Payment Method</CardTitle>
  //         <CardDescription>Manage your payment information</CardDescription>
  //       </CardHeader>
  //       <CardContent>
  //         <div className="flex items-center justify-between">
  //           <div>
  //             <p className="font-medium">
  //               {JSON.stringify(customer)}
  //               {customer?.payment_method}
  //               {customer?.payment_method
  //                 ? `•••• ${customer.payment_method}`
  //                 : "No payment method on file"}
  //             </p>
  //             <p className="text-sm text-muted-foreground">
  //               {customer?.payment_method
  //                 ? `Expires ${customer.payment_method.expMonth}/${customer.payment_method.expYear}`
  //                 : "Add a payment method to upgrade your subscription"}
  //             </p>
  //           </div>
  //           <Button
  //             onClick={() =>
  //               openBillingPortal({
  //                 returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  //               })
  //             }
  //             variant="outline"
  //           >
  //             Update
  //           </Button>
  //         </div>
  //       </CardContent>
  //     </Card>

  //     {/* Invoices */}
  //     <Card>
  //       <CardHeader>
  //         <CardTitle>Invoices</CardTitle>
  //         <CardDescription>
  //           View your billing history and download invoices
  //         </CardDescription>
  //       </CardHeader>
  //       <CardContent>
  //         {customer?.invoices && customer.invoices.length > 0 ? (
  //           <div className="space-y-2">
  //             {customer.invoices.map((_invoice, index) => (
  //               <div
  //                 key={index}
  //                 className="flex items-center justify-between py-2 border-b"
  //               >
  //                 <div>
  //                   <p className="font-medium">Invoice #{index + 1}</p>
  //                   <p className="text-sm text-muted-foreground">
  //                     {new Date().toLocaleDateString()} • $0.00
  //                   </p>
  //                 </div>
  //                 <Button variant="outline" size="sm">
  //                   Download
  //                 </Button>
  //               </div>
  //             ))}
  //           </div>
  //         ) : (
  //           <p className="text-muted-foreground">No invoices available</p>
  //         )}
  //       </CardContent>
  //     </Card>

  //     {/* Cancellation */}
  //     <Card>
  //       <CardHeader>
  //         <CardTitle>Cancel Subscription</CardTitle>
  //         <CardDescription>
  //           If you cancel your subscription, you'll lose access to premium
  //           features at the end of your current billing period.
  //         </CardDescription>
  //       </CardHeader>
  //       <CardContent>
  //         <Button
  //           onClick={() =>
  //             openBillingPortal({
  //               returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  //             })
  //           }
  //           variant="destructive"
  //         >
  //           Cancel Subscription
  //         </Button>
  //       </CardContent>
  //     </Card>
  //   </div>
  // );
}
