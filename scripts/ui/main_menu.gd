extends Control
## 标题菜单：Lobby 背景 + 标题图 + 三个纵向框式按钮（开始/商店/任务）+ 银币 badge。
## 按钮沿用 FramedButton 组件，与 main 分支 createMainMenuButton() 一致。

const ICON_START := "res://assets/ui/icon/icon_play.png"
const ICON_SHOP := "res://assets/ui/icon/shop.png"
const ICON_QUEST := "res://assets/ui/icon/task.png"

@onready var _silver_badge = $SilverBadge
@onready var _start_btn = $CenterGroup/ButtonColumn/StartBtn
@onready var _shop_btn = $CenterGroup/ButtonColumn/ShopBtn
@onready var _quest_btn = $CenterGroup/ButtonColumn/QuestBtn
@onready var _quit_btn = $QuitBtn
@onready var _title_img: TextureRect = $CenterGroup/Title

@onready var _shop_panel: Node = $ShopPanel
@onready var _quest_panel: Node = $QuestPanel


func _ready() -> void:
	Audio.play_music("begin", 1.0)
	_apply_title_locale()
	_update_silver()

	_start_btn.label = I18n.t("menu.start")
	_start_btn.icon = _load_icon(ICON_START)
	_start_btn.pressed.connect(_on_start)

	_shop_btn.label = I18n.t("menu.shop")
	_shop_btn.icon = _load_icon(ICON_SHOP)
	_shop_btn.pressed.connect(_on_shop)

	_quest_btn.label = I18n.t("menu.quests")
	_quest_btn.icon = _load_icon(ICON_QUEST)
	_quest_btn.pressed.connect(_on_quest)

	_quit_btn.label = "退出"
	_quit_btn.pressed.connect(_on_quit)

	if _shop_panel:
		_shop_panel.visible = false
	if _quest_panel:
		_quest_panel.visible = false


func _load_icon(path: String) -> Texture2D:
	return load(path) if ResourceLoader.exists(path) else null


func _apply_title_locale() -> void:
	var locale: String = str(SaveGame.data.get("locale", "zh"))
	var path: String = "res://assets/ui/title/title_cn.webp" if locale == "zh" else "res://assets/ui/title/title_en.webp"
	if ResourceLoader.exists(path):
		_title_img.texture = load(path)


func _update_silver() -> void:
	if _silver_badge:
		_silver_badge.amount = SaveGame.get_silver()


func _on_start() -> void:
	Audio.play_sfx("ui_click")
	get_tree().change_scene_to_file("res://scenes/ui/character_select.tscn")


func _on_shop() -> void:
	Audio.play_sfx("ui_click")
	if _shop_panel and _shop_panel.has_method("open"):
		_shop_panel.open()
		_shop_panel.closed.connect(_update_silver, CONNECT_ONE_SHOT)


func _on_quest() -> void:
	Audio.play_sfx("ui_click")
	if _quest_panel and _quest_panel.has_method("open"):
		_quest_panel.open()
		_quest_panel.closed.connect(_update_silver, CONNECT_ONE_SHOT)


func _on_quit() -> void:
	Audio.play_sfx("ui_click")
	get_tree().quit()
