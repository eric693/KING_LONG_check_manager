// 打卡地點：Nominatim 地址搜尋 + 可拖曳微調的選取器地圖
// 從 script.js 拆出，只依賴 utils.js / i18n.js / libs.js 與 showNotification()。

// ==================== 地點搜尋功能 ====================

/**
 * 使用 Nominatim API 搜尋地點
 */
async function searchLocation(query) {
    if (!query || query.trim() === '') {
        return [];
    }
    
    // 先限定台灣搜尋（門牌與路段的命中率較高），沒有結果再放寬到全球
    const request = async (countryCode) => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
            + `&limit=5&accept-language=zh-TW${countryCode ? '&countrycodes=' + countryCode : ''}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('搜尋失敗');
        return await response.json();
    };
    
    try {
        let results = await request('tw');
        if (!results.length) results = await request('');
        return results;
        
    } catch (error) {
        console.error('地點搜尋錯誤:', error);
        showNotification(t('NOTIF_SEARCH_FAILED'), 'error');
        return [];
    }
}

/**
 * 顯示搜尋結果
 */
function displaySearchResults(results) {
    const resultsList = document.getElementById('search-results-list');
    const resultsContainer = document.getElementById('search-results');
    
    if (!resultsList || !resultsContainer) return;
    
    resultsList.innerHTML = '';
    
    if (results.length === 0) {
        resultsContainer.classList.add('hidden');
        showNotification(t('NOTIF_NO_PLACE_FOUND'), 'warning');
        return;
    }
    
    resultsContainer.classList.remove('hidden');
    
    results.forEach(result => {
        const li = document.createElement('li');
        li.className = 'text-sm text-gray-800 dark:text-gray-200';
        li.innerHTML = `
            <div class="font-semibold">${escapeHtml(result.display_name)}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                ${parseFloat(result.lat).toFixed(6)}, ${parseFloat(result.lon).toFixed(6)}
            </div>
        `;
        
        li.addEventListener('click', () => {
            selectSearchResult(result);
        });
        
        resultsList.appendChild(li);
    });
}

/**
 * 選擇搜尋結果
 */
function selectSearchResult(result) {
    const nameInput = document.getElementById('location-name');
    const latInput = document.getElementById('location-lat');
    const lngInput = document.getElementById('location-lng');
    const addBtn = document.getElementById('add-location-btn');
    const resultsContainer = document.getElementById('search-results');
    
    if (nameInput) nameInput.value = result.display_name.split(',')[0].trim();
    if (latInput) latInput.value = parseFloat(result.lat).toFixed(6);
    if (lngInput) lngInput.value = parseFloat(result.lon).toFixed(6);
    if (addBtn) addBtn.disabled = false;
    if (resultsContainer) resultsContainer.classList.add('hidden');
    
    // 在下方小地圖標出這個點，之後可以拖曳微調
    setPickerLocation(parseFloat(result.lat), parseFloat(result.lon));
    
    showNotification(t('NOTIF_LOCATION_PICKED'), 'success');
}

// ==================== 打卡地點選取器（可拖曳微調） ====================
// 搜尋回來的座標是建物或路段中心，跟實際打卡的門口常差數十公尺，
// 所以在「新增打卡地點」表單裡放一張小地圖，標記可以拖，圓圈即時跟著半徑走。

let pickerMap = null;
let pickerMarker = null;
let pickerCircle = null;

function pickerRadius() {
    const slider = document.getElementById('location-radius');
    return slider ? parseInt(slider.value) : 200;
}

// 把座標寫回表單欄位
function writePickedCoords(lat, lng) {
    const latInput = document.getElementById('location-lat');
    const lngInput = document.getElementById('location-lng');
    const addBtn = document.getElementById('add-location-btn');
    if (latInput) latInput.value = lat.toFixed(6);
    if (lngInput) lngInput.value = lng.toFixed(6);
    if (addBtn) addBtn.disabled = false;
}

/**
 * 在選取器地圖上標出座標；地圖第一次用到時才建立。
 */
async function setPickerLocation(lat, lng) {
    writePickedCoords(lat, lng);
    
    const el = document.getElementById('location-picker-map');
    if (!el) return;
    
    try {
        await ensureLib('leaflet');
    } catch (err) {
        console.error('地圖載入失敗:', err);
        return;
    }
    
    const coords = [lat, lng];
    const radius = pickerRadius();
    
    if (!pickerMap) {
        el.innerHTML = '';
        el.classList.remove('flex', 'items-center', 'justify-center');
        pickerMap = L.map(el).setView(coords, 18);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(pickerMap);
        
        pickerMarker = L.marker(coords, { draggable: true }).addTo(pickerMap);
        pickerCircle = L.circle(coords, {
            color: 'blue', fillColor: '#30f', fillOpacity: 0.2, radius: radius
        }).addTo(pickerMap);
        
        // 拖曳結束就把新座標寫回欄位，圓圈也跟著移動
        pickerMarker.on('drag', (e) => pickerCircle.setLatLng(e.target.getLatLng()));
        pickerMarker.on('dragend', (e) => {
            const p = e.target.getLatLng();
            writePickedCoords(p.lat, p.lng);
            showNotification(t('NOTIF_PICKER_ADJUSTED', { lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) }), 'success');
        });
        // 點地圖也能直接改點位
        pickerMap.on('click', (e) => setPickerLocation(e.latlng.lat, e.latlng.lng));
        
        setTimeout(() => pickerMap.invalidateSize(), 100);
    } else {
        pickerMap.setView(coords, Math.max(pickerMap.getZoom(), 17));
        pickerMarker.setLatLng(coords);
        pickerCircle.setLatLng(coords).setRadius(radius);
    }
}

// 分頁切回管理員時，地圖是在隱藏狀態下建立的話尺寸會歪掉
function refreshLocationPicker() {
    if (pickerMap) setTimeout(() => pickerMap.invalidateSize(), 100);
}

// ==================== 範圍調整拉桿 ====================

/**
 * 初始化範圍拉桿
 */
function initRadiusSlider() {
    const slider = document.getElementById('location-radius');
    const valueDisplay = document.getElementById('radius-value');
    
    if (!slider || !valueDisplay) return;
    
    slider.addEventListener('input', (e) => {
        const value = e.target.value;
        valueDisplay.textContent = value;
        
        //  修正：先檢查 circle 是否存在
        if (circle && currentCoords) {
            circle.setRadius(parseInt(value));
        }
        
        // 新增打卡地點的選取器地圖也要跟著改
        if (pickerCircle) {
            pickerCircle.setRadius(parseInt(value));
        }
    });
}

// ==================== 打卡地點清單：編輯、刪除 ====================
// 新增和編輯共用上面那張表單：按「編輯」把地點帶進表單，按鈕變成「儲存修改」。

let editingLocationId = null;
let locationListCache = [];

function locationText(key, fallback) {
    const text = t(key);
    return text === key ? fallback : text;
}

async function loadLocationList() {
    const list = document.getElementById('location-list');
    const status = document.getElementById('location-list-status');
    if (!list) return;
    if (status) status.textContent = locationText('LOADING', '載入中...');
    try {
        const res = await callApifetch('getLocations');
        if (!res.ok) throw new Error(res.msg || res.code || '');
        locationListCache = Array.isArray(res.locations) ? res.locations : [];
        renderLocationList();
    } catch (err) {
        console.error('載入打卡地點失敗:', err);
        if (status) status.textContent = locationText('NOTIF_LOCATIONS_FAILED_NET', '載入打卡地點失敗');
    }
}

function renderLocationList() {
    const list = document.getElementById('location-list');
    const status = document.getElementById('location-list-status');
    if (!list) return;
    list.innerHTML = '';
    if (status) {
        status.textContent = locationListCache.length
            ? ''
            : locationText('LOCATION_LIST_EMPTY', '還沒有設定打卡地點，員工目前無法打卡。請在下方新增。');
    }
    locationListCache.forEach(loc => {
        const li = document.createElement('li');
        li.className = 'flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50' +
            (loc.id === editingLocationId ? ' ring-2 ring-indigo-500' : '');

        const info = document.createElement('div');
        info.className = 'min-w-0';
        const name = document.createElement('div');
        name.className = 'font-semibold text-gray-800 dark:text-white';
        name.textContent = loc.name;
        const meta = document.createElement('div');
        meta.className = 'text-xs text-gray-500 dark:text-gray-400';
        meta.textContent = locationText('LOCATION_LIST_META', '範圍 {radius} 公尺 · {lat}, {lng}')
            .replace('{radius}', loc.scope)
            .replace('{lat}', Number(loc.lat).toFixed(6))
            .replace('{lng}', Number(loc.lng).toFixed(6));
        info.appendChild(name);
        info.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'flex gap-2';
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'px-3 py-1.5 text-sm rounded-lg btn-secondary';
        editBtn.textContent = locationText('BTN_EDIT', '編輯');
        editBtn.onclick = () => startEditLocation(loc);
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'px-3 py-1.5 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white';
        delBtn.textContent = locationText('BTN_DELETE', '刪除');
        delBtn.onclick = () => removeLocation(loc, delBtn);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        li.appendChild(info);
        li.appendChild(actions);
        list.appendChild(li);
    });
}

function setLocationRadius(radius) {
    const slider = document.getElementById('location-radius');
    const display = document.getElementById('radius-value');
    if (slider) slider.value = radius;
    if (display) display.textContent = slider ? slider.value : radius;
}

function startEditLocation(loc) {
    editingLocationId = loc.id;
    document.getElementById('location-name').value = loc.name;
    setLocationRadius(loc.scope);
    setPickerLocation(Number(loc.lat), Number(loc.lng));

    const title = document.getElementById('location-form-title');
    if (title) title.textContent = locationText('EDIT_LOCATION_TITLE', '編輯打卡地點：{name}').replace('{name}', loc.name);
    const saveBtn = document.getElementById('add-location-btn');
    if (saveBtn) {
        saveBtn.textContent = locationText('SAVE_LOCATION_BTN', '儲存修改');
        saveBtn.disabled = false;
    }
    const cancelBtn = document.getElementById('cancel-edit-location-btn');
    if (cancelBtn) cancelBtn.style.display = '';

    renderLocationList();
    document.getElementById('location-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** 表單回到「新增」狀態（新增成功、儲存修改、取消編輯都會用到） */
function resetLocationForm() {
    editingLocationId = null;
    ['location-name', 'location-lat', 'location-lng', 'location-search'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    setLocationRadius(200);

    const title = document.getElementById('location-form-title');
    if (title) title.textContent = locationText('ADD_LOCATION_TITLE', '新增打卡地點');
    const saveBtn = document.getElementById('add-location-btn');
    if (saveBtn) {
        saveBtn.textContent = locationText('ADD_LOCATION_BTN', '新增地點');
        saveBtn.disabled = true;
    }
    const cancelBtn = document.getElementById('cancel-edit-location-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    const getBtn = document.getElementById('get-location-btn');
    if (getBtn) {
        getBtn.textContent = locationText('GET_LOCATION_BTN', '取得當前位置');
        getBtn.disabled = false;
    }
    if (typeof circle !== 'undefined' && circle && mapInstance) {
        mapInstance.removeLayer(circle);
        circle = null;
    }
    renderLocationList();
}

async function removeLocation(loc, button) {
    let message = locationText('LOCATION_DELETE_CONFIRM', '確定要刪除打卡地點「{name}」嗎？員工之後不能在這裡打卡。')
        .replace('{name}', loc.name);
    if (locationListCache.length === 1) {
        message += '\n\n' + locationText('LOCATION_DELETE_LAST_WARNING', '這是最後一個打卡地點，刪除後所有員工都無法打卡。');
    }
    if (!confirm(message)) return;

    if (button) button.disabled = true;
    try {
        const res = await callApifetch(`deleteLocation&id=${encodeURIComponent(loc.id)}`);
        if (res.ok) {
            showNotification(locationText('NOTIF_LOCATION_DELETED', '已刪除打卡地點'), 'success');
            if (editingLocationId === loc.id) resetLocationForm();
            await loadLocationList();
            if (typeof window.refreshLocationsOnMap === 'function') window.refreshLocationsOnMap();
        } else {
            showNotification(res.msg || locationText('NOTIF_LOCATION_DELETE_FAILED', '刪除打卡地點失敗'), 'error');
            if (button) button.disabled = false;
        }
    } catch (err) {
        console.error('刪除打卡地點失敗:', err);
        showNotification(locationText('NOTIF_LOCATION_DELETE_FAILED', '刪除打卡地點失敗'), 'error');
        if (button) button.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('cancel-edit-location-btn')?.addEventListener('click', resetLocationForm);
    document.getElementById('refresh-locations-btn')?.addEventListener('click', loadLocationList);
});
