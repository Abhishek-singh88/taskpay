#![no_std]

mod todo_payments;

pub use todo_payments::{Error, Task, TodoPayments, TodoPaymentsClient};

#[cfg(test)]
extern crate std;
