use ankurah::property::{Json, Ref};
use ankurah::Model;
use serde::{Deserialize, Serialize};

// liaison id=model
#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Album {
    #[active_type(YrsString)]
    pub name: String,
    pub artist: String,
    pub year: i32,
}
// liaison end

// liaison id=model-task
#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Task {
    pub title: String,
    pub completed: bool,
    pub priority: i32,
}
// liaison end

// liaison id=model-document
#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Document {
    #[active_type(YrsString)]
    pub content: String,
    pub title: String,
}
// liaison end

// liaison id=model-ref
#[derive(Model, Debug, Serialize, Deserialize, Clone)]
pub struct Artist {
    pub name: String,
}

#[derive(Model, Debug, Serialize, Deserialize, Clone)]
pub struct Song {
    pub title: String,
    pub artist: Ref<Artist>,
}
// liaison end

// liaison id=model-json
#[derive(Model, Debug, Serialize, Deserialize, Clone)]
pub struct Track {
    pub name: String,
    pub metadata: Json,
}
// liaison end
