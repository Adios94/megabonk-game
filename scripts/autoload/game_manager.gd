extends Node
## 游戏总管单例。占位骨架，等 gameplay 上来再填。

signal game_started
signal game_over(result: Dictionary)

var run_seconds: float = 0.0
var is_running: bool = false


func _ready() -> void:
	print("[GameManager] ready")


func start_run() -> void:
	run_seconds = 0.0
	is_running = true
	game_started.emit()


func end_run(result: Dictionary = {}) -> void:
	is_running = false
	game_over.emit(result)


func _process(delta: float) -> void:
	if is_running:
		run_seconds += delta
