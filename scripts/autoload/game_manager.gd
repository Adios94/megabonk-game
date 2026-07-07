extends Node
## 游戏总管单例。占位骨架，等 gameplay 上来再填。

signal game_started
signal game_over(result: Dictionary)

var run_seconds: float = 0.0
var run_silver: int = 0
var is_running: bool = false

# 主菜单选择传递到 run
var selected_character: String = "megachad"
var selected_tier: int = 1


func _ready() -> void:
	print("[GameManager] ready")
	process_mode = Node.PROCESS_MODE_ALWAYS


func start_run() -> void:
	run_seconds = 0.0
	run_silver = 0
	is_running = true
	game_started.emit()


func add_run_silver(amount: int) -> void:
	run_silver += amount


func reset_run_state() -> void:
	run_seconds = 0.0
	run_silver = 0
	is_running = true


func end_run(result: Dictionary = {}) -> void:
	is_running = false
	game_over.emit(result)


func _process(delta: float) -> void:
	if is_running and not get_tree().paused:
		run_seconds += delta
	if Input.is_action_just_pressed("restart"):
		get_tree().paused = false
		get_tree().change_scene_to_file("res://scenes/ui/main_menu.tscn")
