use soroban_sdk::{symbol_short, Address, Env, String};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};

use todo_payments::{Task, TodoPayments, TodoPaymentsClient};

struct Setup {
    env: Env,
    creator: Address,
    worker: Address,
    token_id: Address,
    contract_id: Address,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let worker = Address::generate(&env);

    let token_id = env.register_stellar_asset_contract(admin.clone());
    let asset = StellarAssetClient::new(&env, &token_id);
    asset.mint(&creator, &10_000);

    let contract_id = env.register_contract(None, TodoPayments);
    let client = TodoPaymentsClient::new(&env, &contract_id);
    client.init(&token_id);

    let _admin = admin;

    Setup {
        env,
        creator,
        worker,
        token_id,
        contract_id,
    }
}

#[test]
fn test_task_creation_locks_funds() {
    let s = setup();
    let token = TokenClient::new(&s.env, &s.token_id);
    let client = TodoPaymentsClient::new(&s.env, &s.contract_id);

    let reward = 1_000i128;
    let ledger_seq = s.env.ledger().sequence();
    token.approve(&s.creator, &s.contract_id, &reward, &ledger_seq);

    let id = client.create_task(
        &s.creator,
        &String::from_str(&s.env, "Logo Design"),
        &String::from_str(&s.env, "Design a simple logo"),
        &reward,
    );

    let task: Task = client.get_task(&id);
    assert_eq!(task.id, id);
    assert_eq!(task.creator, s.creator);
    assert_eq!(task.worker, s.creator);
    assert_eq!(task.has_worker, false);
    assert_eq!(task.reward, reward);
    assert_eq!(task.status, symbol_short!("OPEN"));

    assert_eq!(token.balance(&s.contract_id), reward);
}

#[test]
fn test_accept_and_submit_flow() {
    let s = setup();
    let token = TokenClient::new(&s.env, &s.token_id);
    let client = TodoPaymentsClient::new(&s.env, &s.contract_id);

    let reward = 2_000i128;
    let ledger_seq = s.env.ledger().sequence();
    token.approve(&s.creator, &s.contract_id, &reward, &ledger_seq);

    let id = client.create_task(
        &s.creator,
        &String::from_str(&s.env, "Write Docs"),
        &String::from_str(&s.env, "Add README details"),
        &reward,
    );

    client.accept_task(&s.worker, &id);
    let task: Task = client.get_task(&id);
    assert_eq!(task.worker, s.worker.clone());
    assert_eq!(task.has_worker, true);
    assert_eq!(task.status, symbol_short!("INPRG"));

    client.submit_task(&s.worker, &id);
    let task: Task = client.get_task(&id);
    assert_eq!(task.status, symbol_short!("SUBMIT"));
}

#[test]
fn test_approval_pays_worker() {
    let s = setup();
    let token = TokenClient::new(&s.env, &s.token_id);
    let client = TodoPaymentsClient::new(&s.env, &s.contract_id);

    let reward = 3_000i128;
    let ledger_seq = s.env.ledger().sequence();
    token.approve(&s.creator, &s.contract_id, &reward, &ledger_seq);

    let id = client.create_task(
        &s.creator,
        &String::from_str(&s.env, "Fix Bug"),
        &String::from_str(&s.env, "Resolve payment issue"),
        &reward,
    );

    client.accept_task(&s.worker, &id);
    client.submit_task(&s.worker, &id);

    let worker_before = token.balance(&s.worker);
    client.approve_task(&s.creator, &id);

    let worker_after = token.balance(&s.worker);
    let task: Task = client.get_task(&id);

    assert_eq!(worker_after, worker_before + reward);
    assert_eq!(task.status, symbol_short!("DONE"));
}
