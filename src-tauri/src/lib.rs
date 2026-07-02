use serde_json::{json, Value};
use std::{
  fs,
  path::PathBuf,
  time::{SystemTime, UNIX_EPOCH},
};
use thiserror::Error;

const LOCAL_OWNER_UID: &str = "local-profile";
const WORKSPACE_FORMAT: &str = "aivalidator.workspace.v1";
const SETTINGS_FORMAT: &str = "aivalidator.settings.v1";
const DEFAULT_DESKTOP_AI_URL: &str = "http://localhost:3000/api/desktop/ai";
const DEFAULT_DESKTOP_WALLET_URL: &str = "http://localhost:3000/api/desktop/wallet";

#[derive(Debug, Error)]
enum CommandError {
  #[error("{0}")]
  Message(String),
  #[error(transparent)]
  Io(#[from] std::io::Error),
  #[error(transparent)]
  Json(#[from] serde_json::Error),
  #[error(transparent)]
  Http(#[from] reqwest::Error),
}

impl serde::Serialize for CommandError {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::ser::Serializer,
  {
    serializer.serialize_str(&self.to_string())
  }
}

type CommandResult<T> = Result<T, CommandError>;

fn now_iso() -> String {
  let now = time::OffsetDateTime::now_utc();
  now.format(&time::format_description::well_known::Rfc3339)
    .unwrap_or_else(|_| {
      let fallback = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
      format!("{fallback}")
    })
}

fn workspace_dir() -> CommandResult<PathBuf> {
  let documents = dirs::document_dir()
    .ok_or_else(|| CommandError::Message("Could not find the Documents directory.".into()))?;
  let dir = documents.join("AI Validator");
  fs::create_dir_all(&dir)?;
  Ok(dir)
}

fn workspace_path() -> CommandResult<PathBuf> {
  Ok(workspace_dir()?.join("workspace.ai-workspace"))
}

fn device_path() -> CommandResult<PathBuf> {
  Ok(workspace_dir()?.join("device.json"))
}

fn settings_path() -> CommandResult<PathBuf> {
  Ok(workspace_dir()?.join("settings.json"))
}

fn desktop_account_id() -> CommandResult<String> {
  let path = device_path()?;
  if path.exists() {
    let text = fs::read_to_string(&path)?;
    let parsed: Value = serde_json::from_str(&text)?;
    if let Some(id) = parsed.get("account_id").and_then(Value::as_str) {
      if !id.trim().is_empty() {
        return Ok(id.to_owned());
      }
    }
  }

  let id = uuid::Uuid::new_v4().to_string();
  fs::write(
    path,
    serde_json::to_string_pretty(&json!({
      "format": "aivalidator.desktop-device.v1",
      "account_id": id,
      "created_at": now_iso(),
    }))?,
  )?;
  Ok(id)
}

fn read_settings() -> CommandResult<Value> {
  let path = settings_path()?;
  if !path.exists() {
    return Ok(json!({
      "format": SETTINGS_FORMAT,
      "hostingMode": "hosted",
      "workspaceName": "AI Validator",
      "deepseekApiKey": "",
      "tavilyApiKey": "",
      "githubToken": "",
      "upstashRedisRestUrl": "",
      "upstashRedisRestToken": "",
      "desktopSharedSecret": "",
      "aiValidatorDesktopApiKey": "",
      "aiValidatorDesktopApiUrl": "",
      "aiValidatorDesktopWalletUrl": "",
    }));
  }

  let text = fs::read_to_string(path)?;
  let parsed: Value = serde_json::from_str(&text)?;
  Ok(parsed)
}

fn read_settings_value(key: &str) -> Option<String> {
  read_settings()
    .ok()
    .and_then(|settings| settings.get(key).and_then(Value::as_str).map(|value| value.trim().to_owned()))
    .filter(|value| !value.is_empty())
}

fn write_settings(settings: &Value) -> CommandResult<()> {
  let path = settings_path()?;
  let mut body = settings.clone();
  if let Some(obj) = body.as_object_mut() {
    obj.insert("format".into(), Value::String(SETTINGS_FORMAT.into()));
  }
  fs::write(path, serde_json::to_string_pretty(&body)?)?;
  Ok(())
}

#[tauri::command]
fn settings_get(_payload: Option<Value>) -> CommandResult<Value> {
  read_settings()
}

#[tauri::command]
fn settings_save(payload: Value) -> CommandResult<Value> {
  write_settings(&payload)?;
  read_settings()
}

#[tauri::command]
fn settings_reset(_payload: Option<Value>) -> CommandResult<Value> {
  let path = settings_path()?;
  if path.exists() {
    fs::remove_file(path)?;
  }
  read_settings()
}

fn read_workspace() -> CommandResult<Vec<Value>> {
  let path = workspace_path()?;
  if !path.exists() {
    return Ok(Vec::new());
  }

  let text = fs::read_to_string(path)?;
  let parsed: Value = serde_json::from_str(&text)?;
  let projects = parsed
    .get("projects")
    .and_then(Value::as_array)
    .cloned()
    .unwrap_or_default();
  Ok(projects)
}

fn write_workspace(projects: &[Value]) -> CommandResult<()> {
  let path = workspace_path()?;
  let body = json!({
    "format": WORKSPACE_FORMAT,
    "exported_at": now_iso(),
    "projects": projects,
  });
  fs::write(path, serde_json::to_string_pretty(&body)?)?;
  Ok(())
}

fn payload_field<'a>(payload: &'a Value, name: &str) -> CommandResult<&'a Value> {
  payload
    .get(name)
    .ok_or_else(|| CommandError::Message(format!("Missing payload field: {name}")))
}

fn make_summary(idea: &Value, report: Option<&Value>) -> Value {
  json!({
    "product_name": idea.get("product_name").cloned().unwrap_or(Value::Null),
    "business_model": idea.get("business_model").cloned().unwrap_or(Value::Null),
    "elevator_pitch": idea.get("elevator_pitch").cloned().unwrap_or(Value::Null),
    "score": report.and_then(|r| r.get("score")).cloned().unwrap_or(Value::Null),
    "personas_count": report
      .and_then(|r| r.get("meta"))
      .and_then(|meta| meta.get("personas_count"))
      .cloned()
      .unwrap_or(Value::Null),
  })
}

fn project_from_input(owner_uid: &str, input: &Value, existing: Option<&Value>) -> CommandResult<Value> {
  let idea = payload_field(input, "idea")?.clone();
  let report = input.get("report").cloned().unwrap_or(Value::Null);
  let timestamp = now_iso();
  let id = existing
    .and_then(|project| project.get("id"))
    .and_then(Value::as_str)
    .map(ToOwned::to_owned)
    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
  let created_at = existing
    .and_then(|project| project.get("created_at"))
    .and_then(Value::as_str)
    .map(ToOwned::to_owned)
    .unwrap_or_else(|| timestamp.clone());

  Ok(json!({
    "id": id,
    "owner_uid": owner_uid,
    "status": if report.is_null() { "draft" } else { "validated" },
    "idea": idea,
    "report": report,
    "knowledge": existing.and_then(|p| p.get("knowledge")).cloned().unwrap_or(Value::Null),
    "panel": existing.and_then(|p| p.get("panel")).cloned().unwrap_or_else(|| json!([])),
    "tasks": existing.and_then(|p| p.get("tasks")).cloned().unwrap_or_else(|| json!([])),
    "chats": existing.and_then(|p| p.get("chats")).cloned().unwrap_or_else(|| json!({})),
    "summary": make_summary(
      payload_field(input, "idea")?,
      if input.get("report").is_some_and(|value| !value.is_null()) { input.get("report") } else { None }
    ),
    "created_at": created_at,
    "updated_at": timestamp,
  }))
}

fn find_project_index(projects: &[Value], project_id: &str) -> Option<usize> {
  projects
    .iter()
    .position(|project| project.get("id").and_then(Value::as_str) == Some(project_id))
}

#[tauri::command]
fn project_create(payload: Value) -> CommandResult<String> {
  let owner_uid = payload
    .get("ownerUid")
    .and_then(Value::as_str)
    .unwrap_or(LOCAL_OWNER_UID);
  let input = payload_field(&payload, "input")?;
  let mut projects = read_workspace()?;
  let project = project_from_input(owner_uid, input, None)?;
  let id = project
    .get("id")
    .and_then(Value::as_str)
    .ok_or_else(|| CommandError::Message("Could not create project id.".into()))?
    .to_owned();
  projects.push(project);
  write_workspace(&projects)?;
  Ok(id)
}

#[tauri::command]
fn project_update(payload: Value) -> CommandResult<()> {
  let project_id = payload_field(&payload, "projectId")?
    .as_str()
    .ok_or_else(|| CommandError::Message("projectId must be a string.".into()))?;
  let input = payload_field(&payload, "input")?;
  let mut projects = read_workspace()?;
  if let Some(index) = find_project_index(&projects, project_id) {
    let owner_uid = projects[index]
      .get("owner_uid")
      .and_then(Value::as_str)
      .unwrap_or(LOCAL_OWNER_UID)
      .to_owned();
    projects[index] = project_from_input(&owner_uid, input, Some(&projects[index]))?;
    write_workspace(&projects)?;
  }
  Ok(())
}

#[tauri::command]
fn project_get(payload: Value) -> CommandResult<Option<Value>> {
  let project_id = payload_field(&payload, "projectId")?
    .as_str()
    .ok_or_else(|| CommandError::Message("projectId must be a string.".into()))?;
  Ok(read_workspace()?
    .into_iter()
    .find(|project| project.get("id").and_then(Value::as_str) == Some(project_id)))
}

#[tauri::command]
fn project_list(_payload: Option<Value>) -> CommandResult<Vec<Value>> {
  let mut projects = read_workspace()?;
  projects.sort_by(|a, b| {
    let a_time = a.get("created_at").and_then(Value::as_str).unwrap_or_default();
    let b_time = b.get("created_at").and_then(Value::as_str).unwrap_or_default();
    b_time.cmp(a_time)
  });
  Ok(projects)
}

fn update_project_field(payload: Value, field: &str, value_field: &str) -> CommandResult<()> {
  let project_id = payload_field(&payload, "projectId")?
    .as_str()
    .ok_or_else(|| CommandError::Message("projectId must be a string.".into()))?;
  let value = payload_field(&payload, value_field)?.clone();
  let mut projects = read_workspace()?;
  if let Some(index) = find_project_index(&projects, project_id) {
    let timestamp = now_iso();
    if let Some(project) = projects[index].as_object_mut() {
      project.insert(field.to_owned(), value);
      project.insert("updated_at".into(), Value::String(timestamp));
    }
    write_workspace(&projects)?;
  }
  Ok(())
}

#[tauri::command]
fn project_update_knowledge(payload: Value) -> CommandResult<()> {
  update_project_field(payload, "knowledge", "knowledge")
}

#[tauri::command]
fn project_update_panel(payload: Value) -> CommandResult<()> {
  update_project_field(payload, "panel", "messages")
}

#[tauri::command]
fn project_update_tasks(payload: Value) -> CommandResult<()> {
  update_project_field(payload, "tasks", "tasks")
}

#[tauri::command]
fn project_delete(payload: Value) -> CommandResult<()> {
  let project_id = payload_field(&payload, "projectId")?
    .as_str()
    .ok_or_else(|| CommandError::Message("projectId must be a string.".into()))?;
  let mut projects = read_workspace()?;
  projects.retain(|project| project.get("id").and_then(Value::as_str) != Some(project_id));
  write_workspace(&projects)?;
  Ok(())
}

#[tauri::command]
fn project_import(payload: Value) -> CommandResult<String> {
  let text = payload_field(&payload, "text")?
    .as_str()
    .ok_or_else(|| CommandError::Message("text must be a string.".into()))?;
  let parsed: Value = serde_json::from_str(text)?;
  let raw_project = parsed.get("project").unwrap_or(&parsed);
  if raw_project.get("idea").is_none() || raw_project.get("summary").is_none() {
    return Err(CommandError::Message("Invalid AI Validator project file.".into()));
  }

  let timestamp = now_iso();
  let mut project = raw_project.clone();
  let id = uuid::Uuid::new_v4().to_string();
  if let Some(obj) = project.as_object_mut() {
    obj.insert("id".into(), Value::String(id.clone()));
    obj.insert("owner_uid".into(), Value::String(LOCAL_OWNER_UID.into()));
    obj.entry("created_at").or_insert_with(|| Value::String(timestamp.clone()));
    obj.insert("updated_at".into(), Value::String(timestamp));
  }

  let mut projects = read_workspace()?;
  projects.push(project);
  write_workspace(&projects)?;
  Ok(id)
}

#[tauri::command]
fn project_restore_workspace(payload: Value) -> CommandResult<usize> {
  let text = payload_field(&payload, "text")?
    .as_str()
    .ok_or_else(|| CommandError::Message("text must be a string.".into()))?;
  let parsed: Value = serde_json::from_str(text)?;
  if parsed.get("format").and_then(Value::as_str) != Some(WORKSPACE_FORMAT) {
    return Err(CommandError::Message("Invalid AI Validator workspace file.".into()));
  }
  let mut projects = parsed
    .get("projects")
    .and_then(Value::as_array)
    .cloned()
    .ok_or_else(|| CommandError::Message("Invalid AI Validator workspace file.".into()))?;
  let timestamp = now_iso();
  for project in &mut projects {
    if let Some(obj) = project.as_object_mut() {
      obj.insert("owner_uid".into(), Value::String(LOCAL_OWNER_UID.into()));
      obj.entry("updated_at").or_insert_with(|| Value::String(timestamp.clone()));
    }
  }
  let count = projects.len();
  write_workspace(&projects)?;
  Ok(count)
}

#[tauri::command]
fn project_erase_all(_payload: Option<Value>) -> CommandResult<()> {
  write_workspace(&[])?;
  Ok(())
}

fn desktop_ai_url() -> String {
  std::env::var("AI_VALIDATOR_DESKTOP_API_URL")
    .ok()
    .filter(|value| !value.trim().is_empty())
    .or_else(|| read_settings_value("aiValidatorDesktopApiUrl"))
    .unwrap_or_else(|| DEFAULT_DESKTOP_AI_URL.to_owned())
}

fn desktop_wallet_url() -> String {
  std::env::var("AI_VALIDATOR_DESKTOP_WALLET_URL")
    .ok()
    .filter(|value| !value.trim().is_empty())
    .or_else(|| read_settings_value("aiValidatorDesktopWalletUrl"))
    .unwrap_or_else(|| DEFAULT_DESKTOP_WALLET_URL.to_owned())
}

fn apply_desktop_headers(builder: reqwest::RequestBuilder) -> CommandResult<reqwest::RequestBuilder> {
  let account_id = desktop_account_id()?;
  let builder = builder.header("x-ai-validator-account-id", account_id);
  let builder = match std::env::var("AI_VALIDATOR_DESKTOP_API_KEY") {
    Ok(key) if !key.trim().is_empty() => builder.bearer_auth(key),
    _ => match read_settings_value("aiValidatorDesktopApiKey") {
      Some(key) => builder.bearer_auth(key),
      None => builder,
    },
  };
  Ok(builder)
}

async fn call_hosted_ai(command: &str, payload: Value) -> CommandResult<Value> {
  let url = desktop_ai_url();
  let client = reqwest::Client::new();
  let request = client.post(&url).json(&json!({
      "command": command,
      "payload": payload,
    }));
  let res = apply_desktop_headers(request)?.send().await?;

  let status = res.status();
  let data: Value = res.json().await?;
  if !status.is_success() {
    let message = data
      .get("error")
      .and_then(Value::as_str)
      .unwrap_or("Hosted AI request failed.");
    return Err(CommandError::Message(message.to_owned()));
  }

  Ok(data)
}

async fn call_hosted_wallet(method: &str, payload: Option<Value>) -> CommandResult<Value> {
  let url = desktop_wallet_url();
  let client = reqwest::Client::new();
  let request = client.post(&url).json(&payload.unwrap_or_else(|| json!({ "action": method })));
  let res = apply_desktop_headers(request)?.send().await?;
  let status = res.status();
  let data: Value = res.json().await?;
  if !status.is_success() {
    let message = data
      .get("error")
      .and_then(Value::as_str)
      .unwrap_or("Hosted wallet request failed.");
    return Err(CommandError::Message(message.to_owned()));
  }
  Ok(data)
}

#[tauri::command]
async fn billing_get_balance(_payload: Option<Value>) -> CommandResult<Value> {
  call_hosted_wallet("balance", Some(json!({ "action": "balance" }))).await
}

#[tauri::command]
async fn billing_top_up(payload: Value) -> CommandResult<Value> {
  call_hosted_wallet("POST", Some(json!({
    "action": "top_up",
    "euros": payload.get("euros").and_then(Value::as_f64).unwrap_or(0.0),
  }))).await
}

macro_rules! ai_command {
  ($name:ident) => {
    #[tauri::command]
    async fn $name(payload: Value) -> CommandResult<Value> {
      call_hosted_ai(stringify!($name), payload).await
    }
  };
}

ai_command!(ai_angles);
ai_command!(ai_audiences);
ai_command!(ai_chat);
ai_command!(ai_conversion);
ai_command!(ai_conjoint);
ai_command!(ai_idea_brief);
ai_command!(ai_intake);
ai_command!(ai_interview);
ai_command!(ai_kb_update);
ai_command!(ai_obsidian_build);
ai_command!(ai_pricing);
ai_command!(ai_research);
ai_command!(ai_strategy);
ai_command!(ai_tasks);
ai_command!(ai_translate);
ai_command!(ai_triage);
ai_command!(ai_validate);

pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      project_create,
      project_update,
      project_get,
      project_list,
      project_update_knowledge,
      project_update_panel,
      project_update_tasks,
      project_delete,
      project_import,
      project_restore_workspace,
      project_erase_all,
      settings_get,
      settings_save,
      settings_reset,
      billing_get_balance,
      billing_top_up,
      ai_angles,
      ai_audiences,
      ai_chat,
      ai_conversion,
      ai_conjoint,
      ai_idea_brief,
      ai_intake,
      ai_interview,
      ai_kb_update,
      ai_obsidian_build,
      ai_pricing,
      ai_research,
      ai_strategy,
      ai_tasks,
      ai_translate,
      ai_triage,
      ai_validate,
    ])
    .run(tauri::generate_context!())
    .expect("error while running AI Validator desktop app");
}
