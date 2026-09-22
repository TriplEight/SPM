# payTo is a plain account rekeyed to the contract

`payTo` is a plain account. It opts into USDC first and is then rekeyed to the PaymentRouter
application. This order cannot be reversed. `payTo` is the leaderboard key and must never
change after the first USDC arrives. The application address would change with every new
contract. With the rekey, a later contract takes over through `releaseAuthority(newApp)`
and `payTo` stays the same. This replaces Variant A (`payTo` = application address).
