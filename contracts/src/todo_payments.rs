use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, String, Symbol,
};
use soroban_sdk::token::Client as TokenClient;

const STATUS_OPEN: Symbol = symbol_short!("OPEN");
const STATUS_IN_PROGRESS: Symbol = symbol_short!("INPRG");
const STATUS_SUBMITTED: Symbol = symbol_short!("SUBMIT");
const STATUS_COMPLETED: Symbol = symbol_short!("DONE");
const STATUS_CANCELLED: Symbol = symbol_short!("CANCEL");

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Task {
    pub id: u64,
    pub creator: Address,
    pub worker: Address,
    pub has_worker: bool,
    pub title: String,
    pub description: String,
    pub reward: i128,
    pub status: Symbol,
}

#[contracttype]
enum DataKey {
    TaskCount,
    Token,
    Task(u64),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidReward = 3,
    TaskNotFound = 4,
    InvalidStatus = 5,
    Unauthorized = 6,
    MissingWorker = 7,
}

#[contract]
pub struct TodoPayments;

#[contractimpl]
impl TodoPayments {
    pub fn init(env: Env, token: Address) {
        if env.storage().instance().has(&DataKey::Token) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::TaskCount, &0u64);
    }

    pub fn create_task(
        env: Env,
        creator: Address,
        title: String,
        description: String,
        reward: i128,
    ) -> u64 {
        creator.require_auth();
        if reward <= 0 {
            panic_with_error!(&env, Error::InvalidReward);
        }

        let token = Self::get_token(&env);
        let contract_addr = env.current_contract_address();
        let token_client = TokenClient::new(&env, &token);
        token_client.transfer_from(&contract_addr, &creator, &contract_addr, &reward);

        let id = Self::next_id(&env);
        let task = Task {
            id,
            creator: creator.clone(),
            worker: creator,
            has_worker: false,
            title,
            description,
            reward,
            status: STATUS_OPEN,
        };
        env.storage().instance().set(&DataKey::Task(id), &task);
        id
    }

    pub fn accept_task(env: Env, worker: Address, task_id: u64) {
        worker.require_auth();
        let mut task = Self::get_task_or_error(&env, task_id);
        if task.status != STATUS_OPEN {
            panic_with_error!(&env, Error::InvalidStatus);
        }
        task.worker = worker;
        task.has_worker = true;
        task.status = STATUS_IN_PROGRESS;
        env.storage().instance().set(&DataKey::Task(task_id), &task);
    }

    pub fn submit_task(env: Env, worker: Address, task_id: u64) {
        worker.require_auth();
        let mut task = Self::get_task_or_error(&env, task_id);
        if task.status != STATUS_IN_PROGRESS {
            panic_with_error!(&env, Error::InvalidStatus);
        }
        if !task.has_worker || task.worker != worker {
            panic_with_error!(&env, Error::Unauthorized);
        }
        task.status = STATUS_SUBMITTED;
        env.storage().instance().set(&DataKey::Task(task_id), &task);
    }

    pub fn approve_task(env: Env, creator: Address, task_id: u64) {
        creator.require_auth();
        let mut task = Self::get_task_or_error(&env, task_id);
        if task.status != STATUS_SUBMITTED {
            panic_with_error!(&env, Error::InvalidStatus);
        }
        if task.creator != creator {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if !task.has_worker {
            panic_with_error!(&env, Error::MissingWorker);
        }
        let worker = task.worker.clone();

        let token = Self::get_token(&env);
        let contract_addr = env.current_contract_address();
        let token_client = TokenClient::new(&env, &token);
        token_client.transfer(&contract_addr, &worker, &task.reward);

        task.status = STATUS_COMPLETED;
        env.storage().instance().set(&DataKey::Task(task_id), &task);
    }

    pub fn cancel_task(env: Env, creator: Address, task_id: u64) {
        creator.require_auth();
        let mut task = Self::get_task_or_error(&env, task_id);
        if task.creator != creator {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if task.status != STATUS_OPEN && task.status != STATUS_IN_PROGRESS {
            panic_with_error!(&env, Error::InvalidStatus);
        }

        let token = Self::get_token(&env);
        let contract_addr = env.current_contract_address();
        let token_client = TokenClient::new(&env, &token);
        token_client.transfer(&contract_addr, &creator, &task.reward);

        task.status = STATUS_CANCELLED;
        env.storage().instance().set(&DataKey::Task(task_id), &task);
    }

    pub fn get_task(env: Env, task_id: u64) -> Task {
        Self::get_task_or_error(&env, task_id)
    }

    pub fn get_task_count(env: Env) -> u64 {
        Self::get_task_count_or_error(&env)
    }

    fn get_task_or_error(env: &Env, task_id: u64) -> Task {
        env.storage()
            .instance()
            .get(&DataKey::Task(task_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::TaskNotFound))
    }

    fn get_task_count_or_error(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::TaskCount)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn get_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn next_id(env: &Env) -> u64 {
        let mut count = Self::get_task_count_or_error(env);
        count += 1;
        env.storage().instance().set(&DataKey::TaskCount, &count);
        count
    }
}
