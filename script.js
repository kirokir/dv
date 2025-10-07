const HUE_STEP = 360;
const DEFAULT_OPACITY = 0.5;
const HISTOGRAM_BINS = 10;
let csvData = [];
let chart = null;
let hot = null;
let updateTimeout = null;

function loadCSV() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    if (!file) return alert('Please select a CSV file');

    Papa.parse(file, {
        header: true,
        dynamicTyping: false, // Handle types manually
        skipEmptyLines: true,
        transform: value => value === '' ? '' : (isNaN(value) ? value : +value),
        complete: function(results) {
            csvData = results.data;
            if (results.errors.length) {
                console.error('CSV Parse Errors:', results.errors);
                alert('Errors parsing CSV. Check console for details.');
            }
            if (!csvData.length || !csvData[0]) return alert('No data in CSV');
            displayTable();
        },
        error: function(err) {
            alert(`Error loading CSV: ${err.message}`);
        }
    });
}

function displayTable() {
    const container = document.getElementById('dataTable');
    if (hot) hot.destroy();

    const headers = Object.keys(csvData[0] || {});
    hot = new Handsontable(container, {
        data: csvData,
        rowHeaders: true,
        colHeaders: headers,
        contextMenu: true,
        manualColumnResize: true,
        manualRowResize: true,
        licenseKey: 'non-commercial-and-evaluation'
    });

    hot.addHook('afterChange', () => {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
            csvData = hot.getSourceData();
            updateColumnSelects();
        }, 300);
    });

    updateColumnSelects();
    document.getElementById('dataPreview').style.display = 'block';
    document.getElementById('chartSection').style.display = 'block';
}

function addColumn() {
    const newColName = prompt('Enter new Y column name:', `Y${Object.keys(csvData[0] || {}).length + 1}`);
    if (!newColName) return;
    if (Object.keys(csvData[0] || {}).includes(newColName)) return alert(`Column "${newColName}" already exists`);
    hot.alter('insert_col', null, 1, 'user-added-column');
    hot.setDataAtCell(0, hot.countCols() - 1, newColName, 'user-added-column');
    csvData.forEach(row => row[newColName] = 0);
    updateColumnSelects();
}

function addRow() {
    hot.alter('insert_row', null, 1, 'user-added-row');
    const newRow = {};
    Object.keys(csvData[0] || {}).forEach(key => newRow[key] = '');
    csvData.push(newRow);
    updateColumnSelects();
}

function updateColumnSelects() {
    const columns = Object.keys(csvData[0] || {});
    ['xCol', 'yCol', 'groupCol'].forEach(id => {
        const select = document.getElementById(id);
        const selected = id === 'yCol' ? Array.from(select.selectedOptions).map(opt => opt.value) : select.value;
        select.innerHTML = id === 'groupCol' ? '<option value="">None</option>' : '<option value="">Select...</option>';
        select.innerHTML += columns.map(col => `<option value="${col}" ${selected.includes(col) ? 'selected' : ''}>${col}</option>`).join('');
    });
}

function renderChart() {
    const xCol = document.getElementById('xCol').value;
    const yCols = Array.from(document.getElementById('yCol').selectedOptions).map(opt => opt.value);
    const groupCol = document.getElementById('groupCol').value;
    const chartType = document.getElementById('chartType').value;
    const title = document.getElementById('chartTitle').value || `${chartType.toUpperCase()} Chart`;

    if (!yCols.length) return alert('Select at least one Y column');
    if (chartType !== 'histogram' && chartType !== 'boxplot' && !xCol) return alert('Select X column');
    if (chartType === 'boxplot' && !groupCol) return alert('Boxplot requires a Group column');
    if (chartType === 'pie' && yCols.length > 1) return alert('Pie chart uses only the first Y column');
    if (new Set(yCols.concat([xCol, groupCol].filter(Boolean))).size !== yCols.length + (xCol ? 1 : 0) + (groupCol ? 1 : 0)) {
        return alert('Duplicate column selections are not allowed');
    }

    const canvas = document.getElementById('myChart');
    const ctx = canvas.getContext('2d');
    if (chart) {
        chart.destroy();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        chart = null;
    }

    let labels = [];
    let datasets = [];
    const uniqueLabels = [...new Set(csvData.map(d => d[xCol]).filter(v => v != null && v !== ''))];
    const uniqueGroups = groupCol ? [...new Set(csvData.map(d => d[groupCol]).filter(v => v != null && v !== ''))] : [];

    if (groupCol && chartType !== 'pie' && chartType !== 'histogram' && chartType !== 'boxplot') {
        if (!uniqueGroups.length) return alert('No valid groups found');
        datasets = uniqueGroups.flatMap(group => 
            yCols.map((yCol, i) => {
                const subset = csvData.filter(d => d[groupCol] === group);
                const data = uniqueLabels.map(label => {
                    const row = subset.find(d => d[xCol] === label);
                    return row && typeof row[yCol] === 'number' ? row[yCol] : null;
                });
                return {
                    label: `${yCol} (${group})`,
                    data,
                    backgroundColor: `hsl(${(i * uniqueGroups.length + uniqueGroups.indexOf(group)) * HUE_STEP / (yCols.length * uniqueGroups.length)}, 70%, 50%)`,
                    borderColor: `hsl(${(i * uniqueGroups.length + uniqueGroups.indexOf(group)) * HUE_STEP / (yCols.length * uniqueGroups.length)}, 70%, 30%)`,
                    fill: chartType === 'line-area'
                };
            })
        );
        labels = uniqueLabels;
    } else if (chartType !== 'pie' && chartType !== 'histogram' && chartType !== 'boxplot') {
        labels = uniqueLabels;
        datasets = yCols.map((yCol, i) => ({
            label: yCol,
            data: csvData.map(d => d[yCol]).filter(v => v != null && v !== ''),
            backgroundColor: `hsla(${i * HUE_STEP / yCols.length}, 70%, 50%, ${DEFAULT_OPACITY})`,
            borderColor: `hsl(${i * HUE_STEP / yCols.length}, 70%, 30%)`,
            fill: chartType === 'line-area'
        }));
    }

    const config = {
        type: chartType.startsWith('bar') ? 'bar' : chartType.replace('-area', ''),
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { title: { display: true, text: title } },
            scales: chartType !== 'pie' ? { y: { beginAtZero: true } } : {}
        }
    };

    if (chartType === 'pie') {
        const aggMap = new Map();
        let index = 0;
        csvData.forEach(d => {
            const key = d[xCol] != null && d[xCol] !== '' ? d[xCol] : `Index ${index++}`;
            const val = d[yCols[0]];
            if (key != null && typeof val === 'number') {
                aggMap.set(key, (aggMap.get(key) || 0) + val);
            }
        });
        if (!aggMap.size) return alert('No valid data for pie chart');
        const [pieLabels, pieValues] = Array.from(aggMap.entries()).reduce(([l, v], [key, val]) => [l.concat(key), v.concat(val)], [[], []]);
        config.data = {
            labels: pieLabels,
            datasets: [{
                data: pieValues,
                backgroundColor: pieLabels.map((_, i) => `hsl(${i * HUE_STEP / pieLabels.length}, 70%, 50%)`)
            }]
        };
    } else if (chartType === 'scatter') {
        config.data.datasets = yCols.map((yCol, i) => ({
            label: yCol,
            data: csvData
                .filter(d => typeof d[xCol] === 'number' && typeof d[yCol] === 'number')
                .map(d => ({ x: d[xCol], y: d[yCol] })),
            backgroundColor: `hsl(${i * HUE_STEP / yCols.length}, 70%, 50%)`
        }));
        if (!config.data.datasets.some(ds => ds.data.length)) return alert('No valid numeric data for scatter');
        config.options.scales.x = { type: 'linear' };
    } else if (chartType === 'histogram') {
        const yCol = yCols[0];
        const values = csvData.map(d => d[yCol]).filter(v => typeof v === 'number');
        if (!values.length) return alert('No numeric data for histogram');
        const min = Math.min(...values);
        const max = Math.max(...values);
        if (min === max) return alert('Histogram requires varying data');
        const binWidth = (max - min) / HISTOGRAM_BINS;
        const binCounts = Array(HISTOGRAM_BINS).fill(0);
        values.forEach(v => {
            const bin = Math.min(Math.floor((v - min) / binWidth), HISTOGRAM_BINS - 1);
            binCounts[bin]++;
        });
        config.type = 'bar';
        config.data = {
            labels: Array(HISTOGRAM_BINS).fill().map((_, i) => `${(min + i * binWidth).toFixed(2)} - ${(min + (i + 1) * binWidth).toFixed(2)}`),
            datasets: [{ label: 'Frequency', data: binCounts, backgroundColor: `hsla(180, 70%, 50%, ${DEFAULT_OPACITY})` }]
        };
    } else if (chartType === 'boxplot') {
        if (!uniqueGroups.length) return alert('No valid groups for boxplot');
        config.data = {
            labels: uniqueGroups,
            datasets: yCols.map((yCol, i) => ({
                label: yCol,
                data: uniqueGroups.map(group => 
                    csvData.filter(d => d[groupCol] === group).map(d => d[yCol]).filter(v => typeof v === 'number')
                ),
                backgroundColor: `hsla(${i * HUE_STEP / yCols.length}, 70%, 50%, ${DEFAULT_OPACITY})`,
                borderColor: `hsl(${i * HUE_STEP / yCols.length}, 70%, 30%)`,
                outlierColor: '#999999'
            }))
        };
    }

    if (chartType === 'bar-stacked') {
        config.options.scales = {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true }
        };
    }

    try {
        chart = new Chart(ctx, config);
        document.getElementById('chartContainer').style.display = 'block';
    } catch (e) {
        alert(`Error rendering chart: ${e.message}`);
    }
}

function clearChart() {
    if (chart) {
        chart.destroy();
        chart = null;
    }
    const canvas = document.getElementById('myChart');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('chartContainer').style.display = 'none';
}

function downloadChart(format) {
    const canvas = document.getElementById('myChart');
    if (format === 'png') {
        html2canvas(canvas).then(img => {
            const link = document.createElement('a');
            link.download = 'chart.png';
            link.href = img.toDataURL('image/png');
            link.click();
        }).catch(err => alert(`Error downloading chart: ${err.message}`));
    }
}